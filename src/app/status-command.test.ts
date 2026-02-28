import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect } from "vitest";

import type { Config } from "../domain/config-schema";
import type { ConfigLoader } from "../domain/config-loader-port";
import type { DockerServices, ServiceName, ServiceStatus } from "../domain/docker-services-port";
import { healthCheckError } from "../domain/errors";
import type { HealthCheck } from "../domain/health-check-port";
import type { Shell } from "../domain/shell-port";
import { ConfigLoaderTag } from "../domain/config-loader-port";
import { DockerServicesTag } from "../domain/docker-services-port";
import { HealthCheckTag } from "../domain/health-check-port";
import { ShellTag } from "../domain/shell-port";
import { statusCommand } from "./status-command";

const mockShell: Shell = {
  exec: () => Effect.succeed({ exitCode: 1, stdout: "", stderr: "" }),
  execInteractive: () => Effect.succeed(0),
  setProcessCwd: () => Effect.void,
};

const mockConfigLoader: ConfigLoader = {
  load: () =>
    Effect.succeed({
      configUrl: "https://example.com/config.json",
      defaultOrg: "acme",
      defaultProvider: "github",
      baseSearchPath: "~/src",
      logLevel: "info",
      telemetry: { mode: "disabled" },
      orgToProvider: {},
      services: {},
    } satisfies Config),
  save: () => Effect.void,
  refresh: () =>
    Effect.succeed({
      configUrl: "https://example.com/config.json",
      defaultOrg: "acme",
      defaultProvider: "github",
      baseSearchPath: "~/src",
      logLevel: "info",
      telemetry: { mode: "disabled" },
      orgToProvider: {},
      services: {},
    } satisfies Config),
};

const mockDockerServices: DockerServices = {
  up: (_services?: readonly ServiceName[]) => Effect.void,
  down: (_services?: readonly ServiceName[]) => Effect.void,
  restart: (_services?: readonly ServiceName[]) => Effect.void,
  status: () => Effect.succeed([] as readonly ServiceStatus[]),
  logs: (_service?: ServiceName, _options?: { follow?: boolean; tail?: number }) => Effect.void,
  reset: () => Effect.void,
  isDockerAvailable: () => Effect.succeed(false),
  performHealthCheck: () =>
    Effect.succeed({
      toolName: "docker-services",
      status: "warning",
      checkedAt: new Date(),
    }),
};

describe("status-command", () => {
  it.effect("fails when health-check execution fails (no false all-green)", () =>
    Effect.gen(function* () {
      const failingHealthCheck: HealthCheck = {
        runHealthChecks: () => Effect.fail(healthCheckError("registry unavailable")),
        getLatestResults: () => Effect.succeed([]),
        pruneOldRecords: () => Effect.void,
      };

      const testLayer = Layer.mergeAll(
        Layer.succeed(ShellTag, mockShell),
        Layer.succeed(ConfigLoaderTag, mockConfigLoader),
        Layer.succeed(DockerServicesTag, mockDockerServices),
        Layer.succeed(HealthCheckTag, failingHealthCheck),
      );

      const result = yield* Effect.exit(statusCommand.handler({}).pipe(Effect.provide(testLayer)));
      expect(Exit.isFailure(result)).toBe(true);

      if (Exit.isFailure(result)) {
        const failureOption = Cause.failureOption(result.cause);
        expect(Option.isSome(failureOption)).toBe(true);
        if (Option.isSome(failureOption)) {
          const failure = failureOption.value as {
            readonly _tag: string;
            readonly failedComponents?: readonly string[];
          };
          expect(failure._tag).toBe("StatusCheckError");
          expect(failure.failedComponents).toContain("health-check-runtime");
        }
      }
    }),
  );
});
