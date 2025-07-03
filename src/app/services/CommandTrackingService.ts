import { Clock, Context, Effect, Layer } from "effect";

import { type ConfigError, type UnknownError } from "../../domain/errors";
import { type GitService } from "../../domain/ports/Git";
import { RunStoreService } from "../../domain/ports/RunStore";
import { type PathServiceTag } from "../../domain/services/PathService";
import { VersionServiceTag } from "./VersionService";

/**
 * Command tracking service for recording CLI runs
 * This is app-level logic for command execution tracking
 */
export interface CommandTrackingService {
  recordCommandRun(): Effect.Effect<
    string,
    ConfigError | UnknownError,
    RunStoreService | VersionServiceTag | GitService | PathServiceTag
  >;
  completeCommandRun(id: string, exitCode: number): Effect.Effect<void, ConfigError | UnknownError, RunStoreService>;

  /**
   * Gracefully shutdown command tracking by completing any incomplete runs
   */
  gracefulShutdown(): Effect.Effect<void, ConfigError | UnknownError, RunStoreService>;
}

// Individual functions implementing the service methods
const recordCommandRun = Effect.gen(function* () {
  const runStore = yield* RunStoreService;
  const versionService = yield* VersionServiceTag;

  // Gather run information
  const commandName = process.argv[2] || "help";
  const args = process.argv.slice(3);
  const cliVersion = yield* versionService.getCurrentGitCommitSha;
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
    const runStore = yield* RunStoreService;
    const finishedAtMs = yield* Clock.currentTimeMillis;
    const finishedAt = new Date(finishedAtMs);

    yield* runStore.complete(id, exitCode, finishedAt);
  });

const gracefulShutdown = Effect.gen(function* () {
  yield* Effect.logInfo("🛑 Gracefully shutting down command tracking...");
  const runStore = yield* RunStoreService;
  yield* runStore.completeIncompleteRuns();
  yield* Effect.logDebug("✅ Command tracking shutdown complete");
});

// Functional service implementation as plain object
export const CommandTrackingServiceImpl: CommandTrackingService = {
  recordCommandRun: () => recordCommandRun,
  completeCommandRun: completeCommandRun,
  gracefulShutdown: () => gracefulShutdown,
};

// Service tag for Effect Context system
export class CommandTrackingServiceTag extends Context.Tag("CommandTrackingService")<
  CommandTrackingServiceTag,
  CommandTrackingService
>() {}

// Layer that provides CommandTrackingService (no `new` keyword)
export const CommandTrackingServiceLive = Layer.succeed(CommandTrackingServiceTag, CommandTrackingServiceImpl);
