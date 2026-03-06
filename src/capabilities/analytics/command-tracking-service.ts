import { Clock, Effect, Layer } from "effect";

import { RunStoreTag, type RunStore } from "~/capabilities/persistence/run-store-port";
import { type ConfigError, type UnknownError } from "~/core/errors";
import { RuntimeContextTag, type RuntimeContext } from "~/core/runtime/runtime-context-port";
import { VersionTag, type Version } from "~/core/runtime/version-port";

/**
 * Command tracker for recording CLI runs
 * This is app-level logic for command execution tracking
 */
export interface CommandTracker {
  recordCommandRun(): Effect.Effect<string, ConfigError | UnknownError>;
  completeCommandRun(id: string, exitCode: number): Effect.Effect<void, ConfigError | UnknownError>;

  /**
   * Gracefully shutdown command tracking by completing any incomplete runs
   */
  gracefulShutdown(): Effect.Effect<void, ConfigError | UnknownError>;
}

export const makeCommandTracker = (runStore: RunStore, version: Version, runtimeContext: RuntimeContext): CommandTracker => {
  const recordCommandRun = (): Effect.Effect<string, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      // Gather run information
      const argv = runtimeContext.getArgv();
      const commandName = argv[2] || "help";
      const args = argv.slice(3);
      const cliVersion = yield* version.getCurrentGitCommitSha();
      const cwd = runtimeContext.getCwd();
      const startedAtMs = yield* Clock.currentTimeMillis;
      const startedAt = new Date(startedAtMs);

      // Record this run
      const runId = yield* runStore.record({
        cliVersion,
        commandName,
        arguments: args.length > 0 ? JSON.stringify(args) : undefined,
        cwd,
        startedAt,
      });

      return runId;
    });

  const completeCommandRun = (id: string, exitCode: number): Effect.Effect<void, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      const finishedAtMs = yield* Clock.currentTimeMillis;
      const finishedAt = new Date(finishedAtMs);
      yield* runStore.complete(id, exitCode, finishedAt);
    });

  const gracefulShutdown = (): Effect.Effect<void, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("🛑 Gracefully shutting down command tracking...");

      // Try to complete incomplete runs, but don't fail if database is unavailable
      yield* runStore.completeIncompleteRuns().pipe(
        Effect.tap(() => Effect.logDebug("✅ Command tracking shutdown complete")),
        Effect.catchTags({
          ConfigError: (error) => Effect.logDebug(`Command tracking shutdown skipped (database unavailable): ${error.reason}`),
          UnknownError: (error) => Effect.logDebug(`Command tracking shutdown skipped (database unavailable): ${String(error.reason)}`),
        }),
      );
    });

  return {
    recordCommandRun,
    completeCommandRun,
    gracefulShutdown,
  };
};

export class CommandTrackerTag extends Effect.Service<CommandTracker>()("CommandTracker", {
  dependencies: [Layer.service(RunStoreTag), Layer.service(VersionTag), Layer.service(RuntimeContextTag)],
  effect: Effect.gen(function* () {
    const runStore = yield* RunStoreTag;
    const version = yield* VersionTag;
    const runtimeContext = yield* RuntimeContextTag;
    return makeCommandTracker(runStore, version, runtimeContext);
  }),
}) {}

export const CommandTrackerLiveLayer = CommandTrackerTag.Default;
