import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";
import { afterEach, describe, expect } from "vitest";

import { AutoUpgradeTriggerLive, resolveAutoUpgradeInvocation } from "~/capabilities/system/auto-upgrade-trigger-live";
import { UnknownError } from "~/core/errors";

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

describe("auto-upgrade-trigger-live", () => {
  const bunGlobal = Bun as unknown as { spawn: typeof Bun.spawn };
  const originalSpawn = bunGlobal.spawn;

  afterEach(() => {
    bunGlobal.spawn = originalSpawn;
  });

  it.effect("spawns detached background upgrade process", () =>
    Effect.gen(function* () {
      let spawnArgs: string[] = [];
      let spawnOptions: Bun.SpawnOptions.OptionsObject<"ignore", "ignore", "ignore"> | undefined;
      let unrefCalled = false;

      bunGlobal.spawn = ((args, options) => {
        spawnArgs = [...args];
        spawnOptions = options as Bun.SpawnOptions.OptionsObject<"ignore", "ignore", "ignore">;
        return {
          unref: () => {
            unrefCalled = true;
          },
        } as unknown as ReturnType<typeof Bun.spawn>;
      }) as typeof Bun.spawn;

      const trigger = AutoUpgradeTriggerLive;

      yield* withArgv(["bun", "src/index.ts", "status"], trigger.trigger());

      expect(spawnArgs).toEqual([process.execPath, "src/index.ts", "upgrade"]);
      expect(spawnOptions?.detached).toBe(true);
      expect(spawnOptions?.cwd).toBe(process.cwd());
      expect(spawnOptions?.env?.DEV_AUTO_UPGRADE).toBe("1");
      expect(unrefCalled).toBe(true);
    }),
  );

  it("resolves compiled binary invocations to the executable path", () => {
    expect(resolveAutoUpgradeInvocation(["bun", "/$bunfs/root/dev", "status"], "/tmp/dist/dev")).toEqual(["/tmp/dist/dev", "upgrade"]);
  });

  it.effect("fails with UnknownError when CLI invocation cannot be determined", () =>
    Effect.gen(function* () {
      const trigger = AutoUpgradeTriggerLive;
      const result = yield* Effect.exit(withArgv(["bun"], trigger.trigger()));

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

  it.effect("fails with UnknownError when spawn throws", () =>
    Effect.gen(function* () {
      bunGlobal.spawn = (() => {
        throw new Error("spawn failed");
      }) as typeof Bun.spawn;

      const trigger = AutoUpgradeTriggerLive;
      const result = yield* Effect.exit(withArgv(["bun", "src/index.ts", "status"], trigger.trigger()));

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
