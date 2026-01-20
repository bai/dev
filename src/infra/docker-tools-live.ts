import { Clock, Context, Effect, Layer } from "effect";

import { healthCheckError, type HealthCheckError } from "../domain/errors";
import type { HealthCheckResult } from "../domain/health-check-port";
import { ShellTag, type Shell } from "../domain/shell-port";

export const DOCKER_MIN_VERSION = "29.1.3";

const compareVersions = (version1: string, version2: string): number => {
  const v1Parts = version1.split(".").map(Number);
  const v2Parts = version2.split(".").map(Number);
  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  while (v1Parts.length < maxLength) v1Parts.push(0);
  while (v2Parts.length < maxLength) v2Parts.push(0);
  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] ?? 0;
    const v2Part = v2Parts[i] ?? 0;
    if (v1Part < v2Part) return -1;
    if (v1Part > v2Part) return 1;
  }
  return 0;
};

/**
 * Docker tools for version checking (includes Docker Compose)
 */
export interface DockerTools {
  readonly getDockerVersion: () => Effect.Effect<string | null, never>;
  readonly getComposeVersion: () => Effect.Effect<string | null, never>;
  readonly performHealthCheck: () => Effect.Effect<HealthCheckResult, HealthCheckError>;
}

export const makeDockerToolsLive = (shell: Shell): DockerTools => ({
  getDockerVersion: (): Effect.Effect<string | null, never> =>
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
      Effect.catchAll(() => Effect.succeed(null)),
    ),

  getComposeVersion: (): Effect.Effect<string | null, never> =>
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
      Effect.catchAll(() => Effect.succeed(null)),
    ),

  performHealthCheck: (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    Effect.gen(function* () {
      const dockerTools = makeDockerToolsLive(shell);
      const checkedAt = new Date(yield* Clock.currentTimeMillis);

      const dockerVersion = yield* dockerTools
        .getDockerVersion()
        .pipe(Effect.mapError(() => healthCheckError("Failed to get docker version", "docker")));

      if (!dockerVersion) {
        return {
          toolName: "docker",
          status: "fail",
          notes: "Docker not found or unable to determine version",
          checkedAt,
        };
      }

      const composeVersion = yield* dockerTools.getComposeVersion();
      const version = composeVersion ? `${dockerVersion} (compose ${composeVersion})` : dockerVersion;

      const isCompliant = compareVersions(dockerVersion, DOCKER_MIN_VERSION) >= 0;
      if (!isCompliant) {
        return {
          toolName: "docker",
          version,
          status: "warning",
          notes: `requires >=${DOCKER_MIN_VERSION}`,
          checkedAt,
        };
      }

      return {
        toolName: "docker",
        version,
        status: "ok",
        checkedAt,
      };
    }),
});

export class DockerToolsTag extends Context.Tag("DockerTools")<DockerToolsTag, DockerTools>() {}

export const DockerToolsLiveLayer = Layer.effect(
  DockerToolsTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeDockerToolsLive(shell);
  }),
);
