import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";
import { describe, expect } from "vitest";

import { makeCommandTracker } from "~/capabilities/analytics/command-tracking-service";
import { RunStoreMock } from "~/capabilities/persistence/run-store-mock";
import { ConfigError, UnknownError } from "~/core/errors";
import type { CommandRun } from "~/core/models";
import type { RuntimeContextService } from "~/core/runtime/runtime-context-port";
import type { VersionService } from "~/core/runtime/version-port";

const baseVersionService: VersionService = {
  getCurrentGitCommitSha: () => Effect.succeed("deadbeef"),
  getVersion: () => Effect.succeed("deadbeef"),
};

const makeRuntimeContext = (argv: readonly string[], cwd: string): RuntimeContextService => ({
  getArgv: () => argv,
  getCwd: () => cwd,
});

describe("command-tracking-service", () => {
  it.effect("records command metadata with serialized arguments", () =>
    Effect.gen(function* () {
      let recordedRun: Omit<CommandRun, "id" | "durationMs"> | undefined;

      const runStore = new RunStoreMock({
        overrides: {
          record: (run) =>
            Effect.sync(() => {
              recordedRun = run;
              return "captured-run-id";
            }),
        },
      });

      const versionService: VersionService = {
        getCurrentGitCommitSha: () => Effect.succeed("deadbeef"),
        getVersion: () => Effect.succeed("deadbeef"),
      };
      const runtimeContext = makeRuntimeContext(["bun", "src/index.ts", "sync", "--all"], "/workspace/repo");
      const tracker = makeCommandTracker(runStore, versionService, runtimeContext);

      const runId = yield* tracker.recordCommandRun();

      expect(runId).toBe("captured-run-id");
      expect(recordedRun?.commandName).toBe("sync");
      expect(recordedRun?.arguments).toBe('["--all"]');
      expect(recordedRun?.cliVersion).toBe("deadbeef");
      expect(recordedRun?.cwd).toBe("/workspace/repo");
      expect(recordedRun?.startedAt).toBeInstanceOf(Date);
    }),
  );

  it.effect("completes a recorded command run", () =>
    Effect.gen(function* () {
      let completedId = "";
      let completedExitCode = -1;
      let completedAt: Date | undefined;

      const runStore = new RunStoreMock({
        overrides: {
          complete: (id, exitCode, finishedAt) =>
            Effect.sync(() => {
              completedId = id;
              completedExitCode = exitCode;
              completedAt = finishedAt;
            }),
        },
      });

      const tracker = makeCommandTracker(
        runStore,
        baseVersionService,
        makeRuntimeContext(["bun", "src/index.ts", "help"], "/workspace/repo"),
      );
      yield* tracker.completeCommandRun("run-123", 0);

      expect(completedId).toBe("run-123");
      expect(completedExitCode).toBe(0);
      expect(completedAt).toBeInstanceOf(Date);
    }),
  );

  it.effect("gracefulShutdown succeeds even when run-store completion fails", () =>
    Effect.gen(function* () {
      const configFailingStore = new RunStoreMock({
        overrides: {
          completeIncompleteRuns: () => new ConfigError({ message: "db unavailable" }),
        },
      });

      const unknownFailingStore = new RunStoreMock({
        overrides: {
          completeIncompleteRuns: () => new UnknownError({ message: "unknown db error", details: "unknown db error" }),
        },
      });

      const runtimeContext = makeRuntimeContext(["bun", "src/index.ts", "help"], "/workspace/repo");
      const configResult = yield* Effect.exit(
        makeCommandTracker(configFailingStore, baseVersionService, runtimeContext).gracefulShutdown(),
      );
      const unknownResult = yield* Effect.exit(
        makeCommandTracker(unknownFailingStore, baseVersionService, runtimeContext).gracefulShutdown(),
      );

      expect(Exit.isSuccess(configResult)).toBe(true);
      expect(Exit.isSuccess(unknownResult)).toBe(true);
    }),
  );

  it.effect("propagates run-store failures from recordCommandRun", () =>
    Effect.gen(function* () {
      const failingStore = new RunStoreMock({
        overrides: {
          record: () => new ConfigError({ message: "write failed" }),
        },
      });

      const versionService: VersionService = {
        getCurrentGitCommitSha: () => Effect.succeed("deadbeef"),
        getVersion: () => Effect.succeed("deadbeef"),
      };
      const tracker = makeCommandTracker(
        failingStore,
        versionService,
        makeRuntimeContext(["bun", "src/index.ts", "status"], "/workspace/repo"),
      );

      const result = yield* Effect.exit(tracker.recordCommandRun());

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value).toBeInstanceOf(ConfigError);
        }
      }
    }),
  );

  it.effect("keeps failure type for UnknownError from run-store", () =>
    Effect.gen(function* () {
      const failingStore = new RunStoreMock({
        overrides: {
          complete: () => new UnknownError({ message: "db crashed", details: "db crashed" }),
        },
      });

      const result = yield* Effect.exit(
        makeCommandTracker(
          failingStore,
          baseVersionService,
          makeRuntimeContext(["bun", "src/index.ts", "status"], "/workspace/repo"),
        ).completeCommandRun("run-unknown", 2),
      );

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value).toBeInstanceOf(UnknownError);
        }
      }
    }),
  );
});
