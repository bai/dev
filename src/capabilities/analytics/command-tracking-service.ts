import { Clock, Effect, Layer } from "effect";

import { RunStore, type RunStoreService } from "~/capabilities/persistence/run-store-port";
import { type ConfigError, type UnknownError } from "~/core/errors";
import { RuntimeContext, type RuntimeContextService } from "~/core/runtime/runtime-context-port";
import { Version, type VersionService } from "~/core/runtime/version-port";

/**
 * Command tracker for recording CLI runs
 * This is app-level logic for command execution tracking
 */
export interface CommandTrackerService {
  recordCommandRun(): Effect.Effect<string, ConfigError | UnknownError>;
  completeCommandRun(id: string, exitCode: number): Effect.Effect<void, ConfigError | UnknownError>;

  /**
   * Gracefully shutdown command tracking by completing any incomplete runs
   */
  gracefulShutdown(): Effect.Effect<void, ConfigError | UnknownError>;
}

export const makeCommandTracker = (
  runStore: RunStoreService,
  version: VersionService,
  runtimeContext: RuntimeContextService,
): CommandTrackerService => {
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
          ConfigError: (error) => Effect.logDebug(`Command tracking shutdown skipped (database unavailable): ${error.message}`),
          UnknownError: (error) => Effect.logDebug(`Command tracking shutdown skipped (database unavailable): ${error.message}`),
        }),
      );
    });

  return {
    recordCommandRun,
    completeCommandRun,
    gracefulShutdown,
  };
};

export class CommandTracker extends Effect.Service<CommandTrackerService>()("CommandTracker", {
  dependencies: [Layer.service(RunStore), Layer.service(Version), Layer.service(RuntimeContext)],
  effect: Effect.gen(function* () {
    const runStore = yield* RunStore;
    const version = yield* Version;
    const runtimeContext = yield* RuntimeContext;
    return makeCommandTracker(runStore, version, runtimeContext);
  }),
}) {}

export const CommandTrackerLiveLayer = CommandTracker.Default;
