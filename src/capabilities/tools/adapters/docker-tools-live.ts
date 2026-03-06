import { Clock, Effect } from "effect";

import { ShellLiveLayer } from "~/capabilities/system/shell-live";
import { ShellTag, type Shell } from "~/capabilities/system/shell-port";
import type { HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { healthCheckError, type HealthCheckError } from "~/core/errors";
import { compareVersions } from "~/core/runtime/version-utils";

export const DOCKER_MIN_VERSION = "29.1.3";

/**
 * Docker tools for version checking (includes Docker Compose)
 */
export interface DockerTools {
  readonly getDockerVersion: () => Effect.Effect<string | null, never>;
  readonly getComposeVersion: () => Effect.Effect<string | null, never>;
  readonly performHealthCheck: () => Effect.Effect<HealthCheckResult, HealthCheckError>;
}

export const makeDockerToolsLive = (shell: Shell): DockerTools => {
  const getBinaryPath = (): Effect.Effect<string | undefined, never> =>
    shell.exec("which", ["docker"]).pipe(
      Effect.map((result) => (result.exitCode === 0 && result.stdout ? result.stdout.trim() : undefined)),
      Effect.orElseSucceed(() => undefined),
    );

  const getDockerVersion = (): Effect.Effect<string | null, never> =>
    shell.exec("docker", ["--version"]).pipe(
      Effect.map((result) => {
        if (result.exitCode === 0 && result.stdout) {
          const output = result.stdout.trim();
          // Docker version output is like "Docker version 27.5.1, build 9f9e405"
          const match = output.match(/Docker version (\d+\.\d+\.\d+)/);
          return match?.[1] ?? null;
        }
        return null;
      }),
      Effect.orElseSucceed(() => null),
    );

  const getComposeVersion = (): Effect.Effect<string | null, never> =>
    shell.exec("docker", ["compose", "version"]).pipe(
      Effect.map((result) => {
        if (result.exitCode === 0 && result.stdout) {
          const output = result.stdout.trim();
          // Docker Compose version output is like "Docker Compose version v2.32.4"
          const match = output.match(/Docker Compose version v?(\d+\.\d+\.\d+)/);
          return match?.[1] ?? null;
        }
        return null;
      }),
      Effect.orElseSucceed(() => null),
    );

  const performHealthCheck = (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    Effect.gen(function* () {
      const checkedAt = new Date(yield* Clock.currentTimeMillis);
      const binaryPath = yield* getBinaryPath();

      const dockerVersion = yield* getDockerVersion().pipe(
        Effect.mapError(() => healthCheckError("Failed to get docker version", "docker")),
      );

      if (!dockerVersion) {
        return {
          toolName: "docker",
          binaryPath,
          status: "fail",
          notes: "Docker not found or unable to determine version",
          checkedAt,
        };
      }

      const composeVersion = yield* getComposeVersion();
      const version = composeVersion ? `${dockerVersion} (compose ${composeVersion})` : dockerVersion;

      const isCompliant = compareVersions(dockerVersion, DOCKER_MIN_VERSION) >= 0;
      if (!isCompliant) {
        return {
          toolName: "docker",
          version,
          binaryPath,
          status: "warning",
          notes: `requires >=${DOCKER_MIN_VERSION}`,
          checkedAt,
        };
      }

      return {
        toolName: "docker",
        version,
        binaryPath,
        status: "ok",
        checkedAt,
      };
    });

  return {
    getDockerVersion,
    getComposeVersion,
    performHealthCheck,
  };
};

export class DockerToolsTag extends Effect.Service<DockerTools>()("DockerTools", {
  dependencies: [ShellLiveLayer],
  effect: Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeDockerToolsLive(shell);
  }),
}) {}

export const DockerToolsLiveLayer = DockerToolsTag.Default;
