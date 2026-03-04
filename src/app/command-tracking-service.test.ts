import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect } from "vitest";

import { ConfigError, UnknownError, configError, unknownError } from "../domain/errors";
import type { CommandRun } from "../domain/models";
import { RunStoreTag, type RunStore } from "../domain/run-store-port";
import { VersionTag, type Version } from "../domain/version-port";
import { CommandTrackerLive } from "./command-tracking-service";

const baseRunStore: RunStore = {
  record: () => Effect.succeed("run-id"),
  complete: () => Effect.void,
  prune: () => Effect.void,
  getRecentRuns: () => Effect.succeed([]),
  completeIncompleteRuns: () => Effect.void,
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
      let recordedRun: Omit<CommandRun, "id" | "duration_ms"> | undefined;

      const runStore: RunStore = {
        ...baseRunStore,
        record: (run) =>
          Effect.sync(() => {
            recordedRun = run;
            return "captured-run-id";
          }),
      };

      const versionService: Version = {
        getCurrentGitCommitSha: Effect.succeed("deadbeef"),
        getVersion: Effect.succeed("deadbeef"),
      };

      const layer = Layer.mergeAll(Layer.succeed(RunStoreTag, runStore), Layer.succeed(VersionTag, versionService));

      const runId = yield* withArgv(
        ["bun", "src/index.ts", "sync", "--all"],
        CommandTrackerLive.recordCommandRun().pipe(Effect.provide(layer)),
      );

      expect(runId).toBe("captured-run-id");
      expect(recordedRun?.command_name).toBe("sync");
      expect(recordedRun?.arguments).toBe('["--all"]');
      expect(recordedRun?.cli_version).toBe("deadbeef");
      expect(recordedRun?.cwd).toBe(process.cwd());
      expect(recordedRun?.started_at).toBeInstanceOf(Date);
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

      const layer = Layer.succeed(RunStoreTag, runStore);

      yield* CommandTrackerLive.completeCommandRun("run-123", 0).pipe(Effect.provide(layer));

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

      const configResult = yield* Effect.exit(
        CommandTrackerLive.gracefulShutdown().pipe(Effect.provide(Layer.succeed(RunStoreTag, configFailingStore))),
      );
      const unknownResult = yield* Effect.exit(
        CommandTrackerLive.gracefulShutdown().pipe(Effect.provide(Layer.succeed(RunStoreTag, unknownFailingStore))),
      );

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
        getCurrentGitCommitSha: Effect.succeed("deadbeef"),
        getVersion: Effect.succeed("deadbeef"),
      };

      const layer = Layer.mergeAll(Layer.succeed(RunStoreTag, failingStore), Layer.succeed(VersionTag, versionService));

      const result = yield* Effect.exit(
        withArgv(["bun", "src/index.ts", "status"], CommandTrackerLive.recordCommandRun().pipe(Effect.provide(layer))),
      );

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

      const result = yield* Effect.exit(
        CommandTrackerLive.completeCommandRun("run-unknown", 2).pipe(Effect.provide(Layer.succeed(RunStoreTag, failingStore))),
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
