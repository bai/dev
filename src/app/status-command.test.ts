import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect } from "vitest";

import type { DockerServices, ServiceName, ServiceStatus } from "../domain/docker-services-port";
import { DockerServicesTag } from "../domain/docker-services-port";
import { HealthCheckError, gitError, healthCheckError } from "../domain/errors";
import type { Git } from "../domain/git-port";
import { GitTag } from "../domain/git-port";
import type { HealthCheck } from "../domain/health-check-port";
import { HealthCheckTag } from "../domain/health-check-port";
import type { HealthCheckResult } from "../domain/health-check-port";
import type { CommandRun } from "../domain/models";
import type { RunStore } from "../domain/run-store-port";
import { RunStoreTag } from "../domain/run-store-port";
import { statusCommand } from "./status-command";

const createGit = (branch: string | null, remote: string | null): { git: Git; branchCalls: string[]; remoteCalls: string[] } => {
  const branchCalls: string[] = [];
  const remoteCalls: string[] = [];

  return {
    branchCalls,
    remoteCalls,
    git: {
      cloneRepositoryToPath: () => Effect.void,
      pullLatestChanges: () => Effect.void,
      isGitRepository: () => Effect.succeed(true),
      getCurrentCommitSha: () => Effect.succeed("deadbeef"),
      getCurrentBranch: (repositoryPath) => {
        branchCalls.push(repositoryPath);
        if (branch === null) return gitError("not a git repository");
        return Effect.succeed(branch);
      },
      getRemoteUrl: (repositoryPath, remoteName) => {
        remoteCalls.push(`${repositoryPath}:${remoteName}`);
        if (remote === null) return gitError("remote origin not found");
        return Effect.succeed(remote);
      },
    },
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

const createRunStore = (runs: readonly CommandRun[] = []): RunStore => ({
  record: () => Effect.succeed("run-id"),
  complete: () => Effect.void,
  prune: () => Effect.void,
  getRecentRuns: () => Effect.succeed([...runs]),
  completeIncompleteRuns: () => Effect.void,
});

describe("status-command", () => {
  it.effect("succeeds when all health checks are OK", () =>
    Effect.gen(function* () {
      const gitContext = createGit("main", "https://github.com/acme/repo.git");

      const layer = Layer.mergeAll(
        Layer.succeed(GitTag, gitContext.git),
        Layer.succeed(DockerServicesTag, createDockerServices(false)),
        Layer.succeed(RunStoreTag, createRunStore()),
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
      expect(gitContext.remoteCalls).toEqual([`${process.cwd()}:origin`]);
    }),
  );

  it.effect("succeeds without resolving tool path in status command", () =>
    Effect.gen(function* () {
      const gitContext = createGit("main", "https://github.com/acme/repo.git");

      const layer = Layer.mergeAll(
        Layer.succeed(GitTag, gitContext.git),
        Layer.succeed(DockerServicesTag, createDockerServices(false)),
        Layer.succeed(RunStoreTag, createRunStore()),
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
      const failure = new HealthCheckError({ reason: "boom" });
      const failingHealthCheck: HealthCheck = {
        runHealthChecks: () => Effect.fail(failure),
      };

      const layer = Layer.mergeAll(
        Layer.succeed(GitTag, createGit("main", "https://github.com/acme/repo.git").git),
        Layer.succeed(DockerServicesTag, createDockerServices(false)),
        Layer.succeed(RunStoreTag, createRunStore()),
        Layer.succeed(HealthCheckTag, failingHealthCheck),
      );

      const result = yield* Effect.exit(statusCommand.handler({}).pipe(Effect.provide(layer)));
      expect(Exit.isFailure(result)).toBe(true);
    }),
  );
});
