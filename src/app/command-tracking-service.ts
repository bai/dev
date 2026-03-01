import { Clock, Context, Effect, Layer } from "effect";

import { type ConfigError, type UnknownError } from "../domain/errors";
import type { GitTag } from "../domain/git-port";
import type { PathServiceTag } from "../domain/path-service";
import { RunStoreTag } from "../domain/run-store-port";
import { VersionTag } from "../domain/version-port";

/**
 * Command tracker for recording CLI runs
 * This is app-level logic for command execution tracking
 */
export interface CommandTracker {
  recordCommandRun(): Effect.Effect<
    string,
    ConfigError | UnknownError,
    RunStoreTag | VersionTag | GitTag | PathServiceTag
  >;
  completeCommandRun(id: string, exitCode: number): Effect.Effect<void, ConfigError | UnknownError, RunStoreTag>;

  /**
   * Gracefully shutdown command tracking by completing any incomplete runs
   */
  gracefulShutdown(): Effect.Effect<void, ConfigError | UnknownError, RunStoreTag>;
}

// Individual functions implementing the service methods
const recordCommandRun = Effect.gen(function* () {
  const runStore = yield* RunStoreTag;
  const version = yield* VersionTag;

  // Gather run information
  const commandName = process.argv[2] || "help";
  const args = process.argv.slice(3);
  const cliVersion = yield* version.getCurrentGitCommitSha;
  const cwd = process.cwd();
  const startedAtMs = yield* Clock.currentTimeMillis;
  const startedAt = new Date(startedAtMs);

  // Record this run
  const runId = yield* runStore.record({
    cli_version: cliVersion,
    command_name: commandName,
    arguments: args.length > 0 ? JSON.stringify(args) : undefined,
    cwd,
    started_at: startedAt,
  });

  return runId;
});

const completeCommandRun = (id: string, exitCode: number) =>
  Effect.gen(function* () {
    const runStore = yield* RunStoreTag;
    const finishedAtMs = yield* Clock.currentTimeMillis;
    const finishedAt = new Date(finishedAtMs);

    yield* runStore.complete(id, exitCode, finishedAt);
  });

const gracefulShutdown = Effect.gen(function* () {
  yield* Effect.logDebug("🛑 Gracefully shutting down command tracking...");

  // Try to complete incomplete runs, but don't fail if database is unavailable
  yield* Effect.gen(function* () {
    const runStore = yield* RunStoreTag;
    yield* runStore.completeIncompleteRuns();
    yield* Effect.logDebug("✅ Command tracking shutdown complete");
  }).pipe(
    Effect.catchTags({
      ConfigError: (error) =>
        Effect.logDebug(`Command tracking shutdown skipped (database unavailable): ${error.reason}`),
      UnknownError: (error) =>
        Effect.logDebug(`Command tracking shutdown skipped (database unavailable): ${String(error.reason)}`),
    }),
  );
});

// Functional service implementation as plain object
export const CommandTrackerLive: CommandTracker = {
  recordCommandRun: () => recordCommandRun,
  completeCommandRun: completeCommandRun,
  gracefulShutdown: () => gracefulShutdown,
};

export class CommandTrackerTag extends Context.Tag("CommandTracker")<CommandTrackerTag, CommandTracker>() {}

export const CommandTrackerLiveLayer = Layer.effect(CommandTrackerTag, Effect.succeed(CommandTrackerLive));
