import { Context, Effect, Layer } from "effect";

import { type ConfigError, type UnknownError } from "../../domain/errors";
import { LoggerService } from "../../domain/models";
import { RunStoreService } from "../../domain/ports/RunStore";

const upgradeFrequency = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Update check service for managing upgrade prompts
 * This is app-level logic for upgrade checking
 */
export interface UpdateCheckService {
  runPeriodicUpgradeCheck(): Effect.Effect<void, ConfigError | UnknownError, RunStoreService | LoggerService>;
}

export class UpdateCheckServiceImpl implements UpdateCheckService {
  runPeriodicUpgradeCheck(): Effect.Effect<void, ConfigError | UnknownError, RunStoreService | LoggerService> {
    return Effect.gen(function* () {
      const runStore = yield* RunStoreService;
      const logger = yield* LoggerService;
      const commandName = process.argv[2] || "help";

      // Check if we should prompt for an update (only if not running upgrade command)
      if (commandName !== "upgrade") {
        const recentRuns = yield* runStore.getRecentRuns(100); // Get recent runs to search

        // Find the most recent upgrade command
        const lastUpgradeRun = recentRuns.find((run) => run.command_name === "upgrade");

        const shouldUpdate =
          !lastUpgradeRun ||
          (lastUpgradeRun && new Date().getTime() - lastUpgradeRun.started_at.getTime() > upgradeFrequency);

        if (shouldUpdate) {
          yield* logger.warn("🔄 [dev] It's been more than 7 days since your last upgrade.");
          yield* logger.info("💡 [dev] Run 'dev upgrade' to update your CLI tool and development environment.");
          yield* logger.info("");
        }
      }
    }).pipe(
      Effect.catchAll((error) => {
        return Effect.gen(function* () {
          const logger = yield* LoggerService;
          yield* logger.warn(
            "⚠️  Warning:",
            error._tag === "UnknownError" ? String(error.reason) : "Could not check last run timestamp",
          );
          // Proceed even if we can't check the timestamp, to not break main functionality
        });
      }),
    );
  }
}

// Service tag for Effect Context system
export class UpdateCheckServiceTag extends Context.Tag("UpdateCheckService")<
  UpdateCheckServiceTag,
  UpdateCheckService
>() {}

// Layer that provides UpdateCheckService
export const UpdateCheckServiceLive = Layer.succeed(UpdateCheckServiceTag, new UpdateCheckServiceImpl());
