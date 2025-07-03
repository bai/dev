import { Context, Effect, Layer } from "effect";

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
}

export class CommandTrackingServiceImpl implements CommandTrackingService {
  recordCommandRun(): Effect.Effect<
    string,
    ConfigError | UnknownError,
    RunStoreService | VersionServiceTag | GitService | PathServiceTag
  > {
    return Effect.gen(function* () {
      const runStore = yield* RunStoreService;
      const versionService = yield* VersionServiceTag;

      // Gather enhanced run information
      const commandName = CommandTrackingServiceImpl.extractCommandName();
      const args = CommandTrackingServiceImpl.extractCommandArgs();
      const cliVersion = yield* versionService.getCurrentGitCommitSha;
      const cwd = process.cwd();
      const startedAt = new Date();

      // Record this run with enhanced metadata
      const runId = yield* runStore.record({
        cli_version: cliVersion,
        command_name: commandName,
        arguments: args.length > 0 ? JSON.stringify(args) : "",
        cwd,
        started_at: startedAt,
      });

      return runId;
    });
  }

  completeCommandRun(id: string, exitCode: number): Effect.Effect<void, ConfigError | UnknownError, RunStoreService> {
    return Effect.gen(function* () {
      const runStore = yield* RunStoreService;
      const finishedAt = new Date();

      yield* runStore.complete(id, exitCode, finishedAt);
    });
  }

  private static extractCommandName(): string {
    // Extract command name from process.argv, handling sub-commands and aliases
    const args = process.argv.slice(2);
    if (args.length === 0) return "help";
    
    const command = args[0];
    // Handle special commands
    if (command === "completion" || command === "version") {
      return command;
    }
    
    return command;
  }

  private static extractCommandArgs(): string[] {
    // Extract arguments excluding the command name itself
    const args = process.argv.slice(2);
    if (args.length <= 1) return [];
    
    // Skip the command name, return the rest
    return args.slice(1);
  }
}

// Service tag for Effect Context system
export class CommandTrackingServiceTag extends Context.Tag("CommandTrackingService")<
  CommandTrackingServiceTag,
  CommandTrackingService
>() {}

// Layer that provides CommandTrackingService
export const CommandTrackingServiceLive = Layer.succeed(CommandTrackingServiceTag, new CommandTrackingServiceImpl());
