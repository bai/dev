import { it } from "@effect/vitest";
import { Clock, Effect, Exit } from "effect";
import { describe, expect } from "vitest";

import { configError, unknownError } from "../domain/errors";
import type { CommandRun } from "../domain/models";
import type { RuntimeContext } from "../domain/runtime-context-port";
import { RunStoreMock } from "../infra/run-store-mock";
import { makeUpdateChecker } from "./update-check-service";

const makeRuntimeContext = (argv: readonly string[]): RuntimeContext => ({
  getArgv: () => argv,
  getCwd: () => "/workspace/repo",
});

describe("update-check-service", () => {
  it.effect("starts auto-upgrade when no previous upgrade run exists", () =>
    Effect.gen(function* () {
      let autoUpgradeCalls = 0;

      const checker = makeUpdateChecker(
        new RunStoreMock(),
        () =>
          Effect.sync(() => {
            autoUpgradeCalls += 1;
          }),
        makeRuntimeContext(["bun", "src/index.ts", "status"]),
      );

      yield* checker.runPeriodicUpgradeCheck();

      expect(autoUpgradeCalls).toBe(1);
    }),
  );

  it.effect("does not start auto-upgrade when last upgrade is within the 1-day window", () =>
    Effect.gen(function* () {
      let autoUpgradeCalls = 0;
      const currentTime = yield* Clock.currentTimeMillis;

      const runStore = new RunStoreMock({
        overrides: {
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
        },
      });
      const checker = makeUpdateChecker(
        runStore,
        () =>
          Effect.sync(() => {
            autoUpgradeCalls += 1;
          }),
        makeRuntimeContext(["bun", "src/index.ts", "status"]),
      );

      yield* checker.runPeriodicUpgradeCheck();

      expect(autoUpgradeCalls).toBe(0);
    }),
  );

  it.effect("starts auto-upgrade when last upgrade is older than the 1-day window", () =>
    Effect.gen(function* () {
      let autoUpgradeCalls = 0;
      const currentTime = yield* Clock.currentTimeMillis;

      const runStore = new RunStoreMock({
        overrides: {
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
        },
      });
      const checker = makeUpdateChecker(
        runStore,
        () =>
          Effect.sync(() => {
            autoUpgradeCalls += 1;
          }),
        makeRuntimeContext(["bun", "src/index.ts", "status"]),
      );

      yield* checker.runPeriodicUpgradeCheck();

      expect(autoUpgradeCalls).toBe(1);
    }),
  );

  it.effect("skips update checks while running the upgrade command", () =>
    Effect.gen(function* () {
      let getRecentRunsCalls = 0;

      const runStore = new RunStoreMock({
        overrides: {
          getRecentRuns: () =>
            Effect.sync(() => {
              getRecentRunsCalls += 1;
              return [] as CommandRun[];
            }),
        },
      });
      const checker = makeUpdateChecker(runStore, () => Effect.void, makeRuntimeContext(["bun", "src/index.ts", "upgrade"]));

      yield* checker.runPeriodicUpgradeCheck();

      expect(getRecentRunsCalls).toBe(0);
    }),
  );

  it.effect("checks recent runs for non-upgrade commands", () =>
    Effect.gen(function* () {
      let getRecentRunsCalls = 0;
      let requestedLimit = 0;

      const runStore = new RunStoreMock({
        overrides: {
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
        },
      });
      const checker = makeUpdateChecker(runStore, () => Effect.void, makeRuntimeContext(["bun", "src/index.ts", "status"]));

      yield* checker.runPeriodicUpgradeCheck();

      expect(getRecentRunsCalls).toBe(1);
      expect(requestedLimit).toBe(100);
    }),
  );

  it.effect("swallows UnknownError from auto-upgrade trigger and does not fail", () =>
    Effect.gen(function* () {
      const checker = makeUpdateChecker(
        new RunStoreMock(),
        () => unknownError("cannot spawn background process"),
        makeRuntimeContext(["bun", "src/index.ts", "status"]),
      );

      const result = yield* Effect.exit(checker.runPeriodicUpgradeCheck());

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("swallows ConfigError from run store and does not fail", () =>
    Effect.gen(function* () {
      const runStore = new RunStoreMock({
        overrides: {
          getRecentRuns: () => configError("database unavailable"),
        },
      });
      const checker = makeUpdateChecker(runStore, () => Effect.void, makeRuntimeContext(["bun", "src/index.ts", "status"]));

      const result = yield* Effect.exit(checker.runPeriodicUpgradeCheck());

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("swallows UnknownError from run store and does not fail", () =>
    Effect.gen(function* () {
      const runStore = new RunStoreMock({
        overrides: {
          getRecentRuns: () => unknownError("unexpected failure"),
        },
      });
      const checker = makeUpdateChecker(runStore, () => Effect.void, makeRuntimeContext(["bun", "src/index.ts", "status"]));

      const result = yield* Effect.exit(checker.runPeriodicUpgradeCheck());

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );
});
