import { Clock, Effect } from "effect";

import { ShellLiveLayer } from "~/capabilities/system/shell-live";
import { Shell } from "~/capabilities/system/shell-port";
import type { HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { healthCheckError, type HealthCheckError } from "~/core/errors";
import { compareVersions } from "~/core/runtime/version-utils";

export const DOCKER_MIN_VERSION = "29.1.3";

/**
 * Docker tools for version checking (includes Docker Compose)
 */
export interface DockerToolsService {
  readonly getDockerVersion: () => Effect.Effect<string | null, never>;
  readonly getComposeVersion: () => Effect.Effect<string | null, never>;
  readonly performHealthCheck: () => Effect.Effect<HealthCheckResult, HealthCheckError>;
}

export class DockerTools extends Effect.Service<DockerToolsService>()("DockerTools", {
  dependencies: [ShellLiveLayer],
  effect: Effect.gen(function* () {
    const shell = yield* Shell;
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
            const match = output.match(/Docker Compose version v?(\d+\.\d+\.\d+)/);
            return match?.[1] ?? null;
          }
          return null;
        }),
        Effect.orElseSucceed(() => null),
      );

    return {
      getDockerVersion,
      getComposeVersion,
      performHealthCheck: (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
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
        }),
    } satisfies DockerToolsService;
  }),
}) {}

export const DockerToolsLiveLayer = DockerTools.Default;
