import { it } from "@effect/vitest";
import { Clock, Effect, Exit } from "effect";
import { describe, expect } from "vitest";

import { configError, unknownError } from "../domain/errors";
import type { CommandRun } from "../domain/models";
import type { RunStore } from "../domain/run-store-port";
import { makeUpdateChecker } from "./update-check-service";

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
  it.effect("starts auto-upgrade when no previous upgrade run exists", () =>
    Effect.gen(function* () {
      let autoUpgradeCalls = 0;

      const checker = makeUpdateChecker(baseRunStore, () =>
        Effect.sync(() => {
          autoUpgradeCalls += 1;
        }),
      );

      yield* withArgv(["bun", "src/index.ts", "status"], checker.runPeriodicUpgradeCheck());

      expect(autoUpgradeCalls).toBe(1);
    }),
  );

  it.effect("does not start auto-upgrade when last upgrade is within the 1-day window", () =>
    Effect.gen(function* () {
      let autoUpgradeCalls = 0;
      const currentTime = yield* Clock.currentTimeMillis;

      const runStore: RunStore = {
        ...baseRunStore,
        getRecentRuns: () =>
          Effect.succeed([
            {
              id: "upgrade-recent",
              cliVersion: "abc",
              commandName: "upgrade",
              cwd: "/tmp",
              startedAt: new Date(currentTime),
            },
          ]),
      };
      const checker = makeUpdateChecker(runStore, () =>
        Effect.sync(() => {
          autoUpgradeCalls += 1;
        }),
      );

      yield* withArgv(["bun", "src/index.ts", "status"], checker.runPeriodicUpgradeCheck());

      expect(autoUpgradeCalls).toBe(0);
    }),
  );

  it.effect("starts auto-upgrade when last upgrade is older than the 1-day window", () =>
    Effect.gen(function* () {
      let autoUpgradeCalls = 0;
      const currentTime = yield* Clock.currentTimeMillis;

      const runStore: RunStore = {
        ...baseRunStore,
        getRecentRuns: () =>
          Effect.succeed([
            {
              id: "upgrade-old",
              cliVersion: "abc",
              commandName: "upgrade",
              cwd: "/tmp",
              startedAt: new Date(currentTime - 2 * 24 * 60 * 60 * 1000),
            },
          ]),
      };
      const checker = makeUpdateChecker(runStore, () =>
        Effect.sync(() => {
          autoUpgradeCalls += 1;
        }),
      );

      yield* withArgv(["bun", "src/index.ts", "status"], checker.runPeriodicUpgradeCheck());

      expect(autoUpgradeCalls).toBe(1);
    }),
  );

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
      const checker = makeUpdateChecker(runStore, () => Effect.void);

      yield* withArgv(["bun", "src/index.ts", "upgrade"], checker.runPeriodicUpgradeCheck());

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
                cliVersion: "abc",
                commandName: "upgrade",
                cwd: "/tmp",
                startedAt: new Date(),
              },
            ] satisfies CommandRun[];
          }),
      };
      const checker = makeUpdateChecker(runStore, () => Effect.void);

      yield* withArgv(["bun", "src/index.ts", "status"], checker.runPeriodicUpgradeCheck());

      expect(getRecentRunsCalls).toBe(1);
      expect(requestedLimit).toBe(100);
    }),
  );

  it.effect("swallows UnknownError from auto-upgrade trigger and does not fail", () =>
    Effect.gen(function* () {
      const checker = makeUpdateChecker(baseRunStore, () => unknownError("cannot spawn background process"));

      const result = yield* Effect.exit(withArgv(["bun", "src/index.ts", "status"], checker.runPeriodicUpgradeCheck()));

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("swallows ConfigError from run store and does not fail", () =>
    Effect.gen(function* () {
      const runStore: RunStore = {
        ...baseRunStore,
        getRecentRuns: () => configError("database unavailable"),
      };
      const checker = makeUpdateChecker(runStore, () => Effect.void);

      const result = yield* Effect.exit(withArgv(["bun", "src/index.ts", "status"], checker.runPeriodicUpgradeCheck()));

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("swallows UnknownError from run store and does not fail", () =>
    Effect.gen(function* () {
      const runStore: RunStore = {
        ...baseRunStore,
        getRecentRuns: () => unknownError("unexpected failure"),
      };
      const checker = makeUpdateChecker(runStore, () => Effect.void);

      const result = yield* Effect.exit(withArgv(["bun", "src/index.ts", "status"], checker.runPeriodicUpgradeCheck()));

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );
});
