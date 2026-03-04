import { it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { describe, expect } from "vitest";

import { configError, unknownError } from "../domain/errors";
import type { CommandRun } from "../domain/models";
import { RunStoreTag, type RunStore } from "../domain/run-store-port";
import { UpdateCheckerLive } from "./update-check-service";

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

describe("update-check-service", () => {
  it.effect("skips update checks while running the upgrade command", () =>
    Effect.gen(function* () {
      let getRecentRunsCalls = 0;

      const runStore: RunStore = {
        ...baseRunStore,
        getRecentRuns: () =>
          Effect.sync(() => {
            getRecentRunsCalls += 1;
            return [] as CommandRun[];
          }),
      };

      const layer = Layer.succeed(RunStoreTag, runStore);

      yield* withArgv(["bun", "src/index.ts", "upgrade"], UpdateCheckerLive.runPeriodicUpgradeCheck().pipe(Effect.provide(layer)));

      expect(getRecentRunsCalls).toBe(0);
    }),
  );

  it.effect("checks recent runs for non-upgrade commands", () =>
    Effect.gen(function* () {
      let getRecentRunsCalls = 0;
      let requestedLimit = 0;

      const runStore: RunStore = {
        ...baseRunStore,
        getRecentRuns: (limit) =>
          Effect.sync(() => {
            getRecentRunsCalls += 1;
            requestedLimit = limit;
            return [
              {
                id: "upgrade-1",
                cli_version: "abc",
                command_name: "upgrade",
                cwd: "/tmp",
                started_at: new Date(),
              },
            ] satisfies CommandRun[];
          }),
      };

      const layer = Layer.succeed(RunStoreTag, runStore);

      yield* withArgv(["bun", "src/index.ts", "status"], UpdateCheckerLive.runPeriodicUpgradeCheck().pipe(Effect.provide(layer)));

      expect(getRecentRunsCalls).toBe(1);
      expect(requestedLimit).toBe(100);
    }),
  );

  it.effect("swallows ConfigError from run store and does not fail", () =>
    Effect.gen(function* () {
      const runStore: RunStore = {
        ...baseRunStore,
        getRecentRuns: () => configError("database unavailable"),
      };

      const layer = Layer.succeed(RunStoreTag, runStore);

      const result = yield* Effect.exit(
        withArgv(["bun", "src/index.ts", "status"], UpdateCheckerLive.runPeriodicUpgradeCheck().pipe(Effect.provide(layer))),
      );

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("swallows UnknownError from run store and does not fail", () =>
    Effect.gen(function* () {
      const runStore: RunStore = {
        ...baseRunStore,
        getRecentRuns: () => unknownError("unexpected failure"),
      };

      const layer = Layer.succeed(RunStoreTag, runStore);

      const result = yield* Effect.exit(
        withArgv(["bun", "src/index.ts", "status"], UpdateCheckerLive.runPeriodicUpgradeCheck().pipe(Effect.provide(layer))),
      );

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );
});
