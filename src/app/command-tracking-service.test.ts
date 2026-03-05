import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";
import { describe, expect } from "vitest";

import { ConfigError, UnknownError, configError, unknownError } from "../domain/errors";
import type { CommandRun } from "../domain/models";
import type { RunStore } from "../domain/run-store-port";
import type { Version } from "../domain/version-port";
import { makeCommandTracker } from "./command-tracking-service";

const baseRunStore: RunStore = {
  record: () => Effect.succeed("run-id"),
  complete: () => Effect.void,
  prune: () => Effect.void,
  getRecentRuns: () => Effect.succeed([]),
  completeIncompleteRuns: () => Effect.void,
};

const baseVersionService: Version = {
  getCurrentGitCommitSha: () => Effect.succeed("deadbeef"),
  getVersion: () => Effect.succeed("deadbeef"),
};

const withArgv = <A, E, R>(argv: string[], effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = [...process.argv];
      process.argv = argv;
      return previous;
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        process.argv = previous;
      }),
  );

describe("command-tracking-service", () => {
  it.effect("records command metadata with serialized arguments", () =>
    Effect.gen(function* () {
      let recordedRun: Omit<CommandRun, "id" | "durationMs"> | undefined;

      const runStore: RunStore = {
        ...baseRunStore,
        record: (run) =>
          Effect.sync(() => {
            recordedRun = run;
            return "captured-run-id";
          }),
      };

      const versionService: Version = {
        getCurrentGitCommitSha: () => Effect.succeed("deadbeef"),
        getVersion: () => Effect.succeed("deadbeef"),
      };
      const tracker = makeCommandTracker(runStore, versionService);

      const runId = yield* withArgv(["bun", "src/index.ts", "sync", "--all"], tracker.recordCommandRun());

      expect(runId).toBe("captured-run-id");
      expect(recordedRun?.commandName).toBe("sync");
      expect(recordedRun?.arguments).toBe('["--all"]');
      expect(recordedRun?.cliVersion).toBe("deadbeef");
      expect(recordedRun?.cwd).toBe(process.cwd());
      expect(recordedRun?.startedAt).toBeInstanceOf(Date);
    }),
  );

  it.effect("completes a recorded command run", () =>
    Effect.gen(function* () {
      let completedId = "";
      let completedExitCode = -1;
      let completedAt: Date | undefined;

      const runStore: RunStore = {
        ...baseRunStore,
        complete: (id, exitCode, finishedAt) =>
          Effect.sync(() => {
            completedId = id;
            completedExitCode = exitCode;
            completedAt = finishedAt;
          }),
      };

      const tracker = makeCommandTracker(runStore, baseVersionService);
      yield* tracker.completeCommandRun("run-123", 0);

      expect(completedId).toBe("run-123");
      expect(completedExitCode).toBe(0);
      expect(completedAt).toBeInstanceOf(Date);
    }),
  );

  it.effect("gracefulShutdown succeeds even when run-store completion fails", () =>
    Effect.gen(function* () {
      const configFailingStore: RunStore = {
        ...baseRunStore,
        completeIncompleteRuns: () => configError("db unavailable"),
      };

      const unknownFailingStore: RunStore = {
        ...baseRunStore,
        completeIncompleteRuns: () => unknownError("unknown db error"),
      };

      const configResult = yield* Effect.exit(makeCommandTracker(configFailingStore, baseVersionService).gracefulShutdown());
      const unknownResult = yield* Effect.exit(makeCommandTracker(unknownFailingStore, baseVersionService).gracefulShutdown());

      expect(Exit.isSuccess(configResult)).toBe(true);
      expect(Exit.isSuccess(unknownResult)).toBe(true);
    }),
  );

  it.effect("propagates run-store failures from recordCommandRun", () =>
    Effect.gen(function* () {
      const failingStore: RunStore = {
        ...baseRunStore,
        record: () => configError("write failed"),
      };

      const versionService: Version = {
        getCurrentGitCommitSha: () => Effect.succeed("deadbeef"),
        getVersion: () => Effect.succeed("deadbeef"),
      };
      const tracker = makeCommandTracker(failingStore, versionService);

      const result = yield* Effect.exit(withArgv(["bun", "src/index.ts", "status"], tracker.recordCommandRun()));

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
      const failingStore: RunStore = {
        ...baseRunStore,
        complete: () => unknownError("db crashed"),
      };

      const result = yield* Effect.exit(makeCommandTracker(failingStore, baseVersionService).completeCommandRun("run-unknown", 2));

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
