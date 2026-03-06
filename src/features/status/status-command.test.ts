import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Logger, Option } from "effect";
import { describe, expect } from "vitest";

import { RunStoreMock } from "~/capabilities/persistence/run-store-mock";
import { RunStoreTag } from "~/capabilities/persistence/run-store-port";
import type { DockerServices, ServiceName, ServiceStatus } from "~/capabilities/services/docker-services-port";
import { DockerServicesTag } from "~/capabilities/services/docker-services-port";
import { GitMock } from "~/capabilities/system/git-mock";
import { GitTag } from "~/capabilities/system/git-port";
import type { HealthCheck } from "~/capabilities/tools/health-check-port";
import { HealthCheckTag } from "~/capabilities/tools/health-check-port";
import type { HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { HealthCheckError, dockerServiceError, gitError, healthCheckError } from "~/core/errors";
import type { CommandRun } from "~/core/models";
import { RuntimeContextTag } from "~/core/runtime/runtime-context-port";
import { statusCommand } from "~/features/status/status-command";

const createGit = (branch: string | null, remote: string | null) => {
  const git = new GitMock({
    currentBranch: branch,
    remoteUrl: remote,
  });

  return {
    git,
    branchCalls: git.getCurrentBranchCalls,
    remoteCalls: git.getRemoteUrlCalls,
  };
};

const createDockerServices = (isAvailable: boolean, statuses: readonly ServiceStatus[] = []): DockerServices => ({
  up: (_services?: readonly ServiceName[]) => Effect.void,
  down: (_services?: readonly ServiceName[]) => Effect.void,
  restart: (_services?: readonly ServiceName[]) => Effect.void,
  status: () => Effect.succeed(statuses),
  logs: (_service?: ServiceName, _options?: { follow?: boolean; tail?: number }) => Effect.void,
  reset: () => Effect.void,
  isDockerAvailable: () => Effect.succeed(isAvailable),
  performHealthCheck: () =>
    Effect.succeed({
      toolName: "docker-services",
      status: isAvailable ? "ok" : "warning",
      checkedAt: new Date(),
    }),
});

const createHealthCheck = (results: readonly HealthCheckResult[]): HealthCheck => ({
  runHealthChecks: () => Effect.succeed(results),
});

const createRunStore = (runs: readonly CommandRun[] = []) => new RunStoreMock({ runs });

const runtimeContextLayer = Layer.succeed(RuntimeContextTag, {
  getArgv: () => ["bun", "src/index.ts", "status"] as const,
  getCwd: () => "/workspace/repo",
});

describe("status-command", () => {
  it.effect("succeeds when all health checks are OK", () =>
    Effect.gen(function* () {
      const gitContext = createGit("main", "https://github.com/acme/repo.git");

      const layer = Layer.mergeAll(
        Layer.succeed(GitTag, gitContext.git),
        Layer.succeed(DockerServicesTag, createDockerServices(false)),
        Layer.succeed(RunStoreTag, createRunStore()),
        runtimeContextLayer,
        Layer.succeed(
          HealthCheckTag,
          createHealthCheck([
            {
              toolName: "git",
              version: "2.60.1",
              status: "ok",
              checkedAt: new Date(),
            },
          ]),
        ),
      );

      const result = yield* Effect.exit(statusCommand.handler({}).pipe(Effect.provide(layer)));

      expect(Exit.isSuccess(result)).toBe(true);
      expect(gitContext.branchCalls).toHaveLength(1);
      expect(gitContext.remoteCalls).toEqual(["/workspace/repo:origin"]);
    }),
  );

  it.effect("succeeds without resolving tool path in status command", () =>
    Effect.gen(function* () {
      const gitContext = createGit("main", "https://github.com/acme/repo.git");

      const layer = Layer.mergeAll(
        Layer.succeed(GitTag, gitContext.git),
        Layer.succeed(DockerServicesTag, createDockerServices(false)),
        Layer.succeed(RunStoreTag, createRunStore()),
        runtimeContextLayer,
        Layer.succeed(
          HealthCheckTag,
          createHealthCheck([
            {
              toolName: "git",
              version: "2.60.1",
              status: "ok",
              checkedAt: new Date(),
            },
          ]),
        ),
      );

      const result = yield* Effect.exit(statusCommand.handler({}).pipe(Effect.provide(layer)));

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("succeeds when only warnings are present", () =>
    Effect.gen(function* () {
      const gitContext = createGit("main", "https://github.com/acme/repo.git");

      const layer = Layer.mergeAll(
        Layer.succeed(GitTag, gitContext.git),
        Layer.succeed(DockerServicesTag, createDockerServices(false)),
        Layer.succeed(RunStoreTag, createRunStore()),
        runtimeContextLayer,
        Layer.succeed(
          HealthCheckTag,
          createHealthCheck([
            {
              toolName: "bun",
              version: "1.0.0",
              status: "warning",
              notes: "requires >=1.3.6",
              checkedAt: new Date(),
            },
          ]),
        ),
      );

      const result = yield* Effect.exit(statusCommand.handler({}).pipe(Effect.provide(layer)));

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("fails when health check results contain failing tools", () =>
    Effect.gen(function* () {
      const gitContext = createGit("main", "https://github.com/acme/repo.git");

      const layer = Layer.mergeAll(
        Layer.succeed(GitTag, gitContext.git),
        Layer.succeed(DockerServicesTag, createDockerServices(false)),
        Layer.succeed(RunStoreTag, createRunStore()),
        runtimeContextLayer,
        Layer.succeed(
          HealthCheckTag,
          createHealthCheck([
            {
              toolName: "bun",
              status: "fail",
              notes: "bun missing",
              checkedAt: new Date(),
            },
          ]),
        ),
      );

      const result = yield* Effect.exit(statusCommand.handler({}).pipe(Effect.provide(layer)));

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
          expect(failure.failedComponents).toContain("bun");
        }
      }
    }),
  );

  it.effect("fails when health-check execution fails (synthetic health-check-runtime item)", () =>
    Effect.gen(function* () {
      const gitContext = createGit(null, null);

      const failingHealthCheck: HealthCheck = {
        runHealthChecks: () => healthCheckError("registry unavailable"),
      };

      const layer = Layer.mergeAll(
        Layer.succeed(GitTag, gitContext.git),
        Layer.succeed(DockerServicesTag, createDockerServices(false)),
        Layer.succeed(RunStoreTag, createRunStore()),
        runtimeContextLayer,
        Layer.succeed(HealthCheckTag, failingHealthCheck),
      );

      const result = yield* Effect.exit(statusCommand.handler({}).pipe(Effect.provide(layer)));
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

  it.effect("keeps HealthCheckError tagged type when raised directly by service", () =>
    Effect.gen(function* () {
      const failure = new HealthCheckError({ message: "boom" });
      const failingHealthCheck: HealthCheck = {
        runHealthChecks: () => Effect.fail(failure),
      };

      const layer = Layer.mergeAll(
        Layer.succeed(GitTag, createGit("main", "https://github.com/acme/repo.git").git),
        Layer.succeed(DockerServicesTag, createDockerServices(false)),
        Layer.succeed(RunStoreTag, createRunStore()),
        runtimeContextLayer,
        Layer.succeed(HealthCheckTag, failingHealthCheck),
      );

      const result = yield* Effect.exit(statusCommand.handler({}).pipe(Effect.provide(layer)));
      expect(Exit.isFailure(result)).toBe(true);
    }),
  );

  it.effect("logs docker status failures instead of reporting no services configured", () =>
    Effect.gen(function* () {
      const gitContext = createGit("main", "https://github.com/acme/repo.git");
      const loggedMessages: string[] = [];
      const logger = Logger.make(({ message }) => {
        loggedMessages.push(String(message));
      });
      const dockerServices: DockerServices = {
        ...createDockerServices(true),
        status: () => dockerServiceError("compose status failed"),
      };

      const layer = Layer.mergeAll(
        Layer.succeed(GitTag, gitContext.git),
        Layer.succeed(DockerServicesTag, dockerServices),
        Layer.succeed(RunStoreTag, createRunStore()),
        runtimeContextLayer,
        Layer.succeed(
          HealthCheckTag,
          createHealthCheck([
            {
              toolName: "git",
              version: "2.60.1",
              status: "ok",
              checkedAt: new Date(),
            },
          ]),
        ),
        Logger.replace(Logger.defaultLogger, logger),
      );

      const result = yield* Effect.exit(statusCommand.handler({}).pipe(Effect.provide(layer)));

      expect(Exit.isSuccess(result)).toBe(true);
      expect(loggedMessages).toContain("🐳 Docker Services: Unable to determine status: compose status failed");
      expect(loggedMessages).not.toContain("🐳 Docker Services: No services configured");
    }),
  );
});
