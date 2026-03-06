import { it } from "@effect/vitest";
import { Clock, Effect, Exit } from "effect";
import { describe, expect } from "vitest";

import { RunStoreMock } from "~/capabilities/persistence/run-store-mock";
import { ConfigError, UnknownError } from "~/core/errors";
import type { CommandRun } from "~/core/models";
import { makeInstallPathsMock } from "~/core/runtime/path-service-mock";
import type { RuntimeContextService } from "~/core/runtime/runtime-context-port";
import { makeUpdateChecker } from "~/features/upgrade/update-check-service";

const makeRuntimeContext = (argv: readonly string[]): RuntimeContextService => ({
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
        makeInstallPathsMock(),
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
        makeInstallPathsMock(),
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
        makeInstallPathsMock(),
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
      const checker = makeUpdateChecker(
        runStore,
        () => Effect.void,
        makeRuntimeContext(["bun", "src/index.ts", "upgrade"]),
        makeInstallPathsMock(),
      );

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
      const checker = makeUpdateChecker(
        runStore,
        () => Effect.void,
        makeRuntimeContext(["bun", "src/index.ts", "status"]),
        makeInstallPathsMock(),
      );

      yield* checker.runPeriodicUpgradeCheck();

      expect(getRecentRunsCalls).toBe(1);
      expect(requestedLimit).toBe(100);
    }),
  );

  it.effect("swallows UnknownError from auto-upgrade trigger and does not fail", () =>
    Effect.gen(function* () {
      const checker = makeUpdateChecker(
        new RunStoreMock(),
        () => new UnknownError({ message: "cannot spawn background process", details: "cannot spawn background process" }),
        makeRuntimeContext(["bun", "src/index.ts", "status"]),
        makeInstallPathsMock(),
      );

      const result = yield* Effect.exit(checker.runPeriodicUpgradeCheck());

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("swallows ConfigError from run store and does not fail", () =>
    Effect.gen(function* () {
      const runStore = new RunStoreMock({
        overrides: {
          getRecentRuns: () => new ConfigError({ message: "database unavailable" }),
        },
      });
      const checker = makeUpdateChecker(
        runStore,
        () => Effect.void,
        makeRuntimeContext(["bun", "src/index.ts", "status"]),
        makeInstallPathsMock(),
      );

      const result = yield* Effect.exit(checker.runPeriodicUpgradeCheck());

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("swallows UnknownError from run store and does not fail", () =>
    Effect.gen(function* () {
      const runStore = new RunStoreMock({
        overrides: {
          getRecentRuns: () => new UnknownError({ message: "unexpected failure", details: "unexpected failure" }),
        },
      });
      const checker = makeUpdateChecker(
        runStore,
        () => Effect.void,
        makeRuntimeContext(["bun", "src/index.ts", "status"]),
        makeInstallPathsMock(),
      );

      const result = yield* Effect.exit(checker.runPeriodicUpgradeCheck());

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("skips background auto-upgrade entirely for binary installs", () =>
    Effect.gen(function* () {
      let autoUpgradeCalls = 0;
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

      const checker = makeUpdateChecker(
        runStore,
        () =>
          Effect.sync(() => {
            autoUpgradeCalls += 1;
          }),
        makeRuntimeContext(["/tmp/dist/dev", "/tmp/dist/dev", "status"]),
        makeInstallPathsMock({
          installMode: "binary",
          installDir: "/tmp/dist",
          upgradeCapable: false,
        }),
      );

      yield* checker.runPeriodicUpgradeCheck();

      expect(getRecentRunsCalls).toBe(0);
      expect(autoUpgradeCalls).toBe(0);
    }),
  );
});
