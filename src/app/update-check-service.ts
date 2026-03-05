import { Clock, Context, Duration, Effect, Layer } from "effect";

import { type ConfigError, type UnknownError } from "../domain/errors";
import { RunStoreTag, type RunStore } from "../domain/run-store-port";

const upgradeFrequency = Duration.decode("7 days");

/**
 * Update check service for managing upgrade prompts
 * This is app-level logic for upgrade checking
 */
export interface UpdateChecker {
  runPeriodicUpgradeCheck(): Effect.Effect<void, ConfigError | UnknownError>;
}

export const makeUpdateChecker = (runStore: RunStore): UpdateChecker => {
  const runPeriodicUpgradeCheck = (): Effect.Effect<void, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      const commandName = process.argv[2] || "help";

      // Check if we should prompt for an update (only if not running upgrade command)
      if (commandName !== "upgrade") {
        const recentRuns = yield* runStore.getRecentRuns(100); // Get recent runs to search

        // Find the most recent upgrade command
        const lastUpgradeRun = recentRuns.find((run) => run.commandName === "upgrade");

        const currentTime = yield* Clock.currentTimeMillis;
        const shouldUpdate =
          !lastUpgradeRun || (lastUpgradeRun && currentTime - lastUpgradeRun.startedAt.getTime() > Duration.toMillis(upgradeFrequency));

        if (shouldUpdate) {
          yield* Effect.logInfo("🔄 [dev] It's been more than 7 days since your last upgrade.");
          yield* Effect.logInfo("💡 [dev] Run 'dev upgrade' to update your CLI tool and development environment.");
          yield* Effect.logInfo("");
        }
      }
    }).pipe(
      Effect.catchTags({
        UnknownError: (error) => Effect.logInfo(`WARN: ⚠️  Warning: ${String(error.reason)}`),
        ConfigError: () => Effect.logInfo("WARN: ⚠️  Warning: Could not check last run timestamp"),
      }),
    );

  return {
    runPeriodicUpgradeCheck,
  };
};

// Service tag for Effect Context system
export class UpdateCheckerTag extends Context.Tag("UpdateChecker")<UpdateCheckerTag, UpdateChecker>() {}

// Layer that provides UpdateCheckService
export const UpdateCheckerLiveLayer = Layer.effect(
  UpdateCheckerTag,
  Effect.gen(function* () {
    const runStore = yield* RunStoreTag;
    return makeUpdateChecker(runStore);
  }),
);
