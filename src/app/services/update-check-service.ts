import { Clock, Context, Duration, Effect, Layer } from "effect";

import { type ConfigError, type UnknownError } from "../../domain/errors";
import { RunStorePortTag } from "../../domain/ports/run-store-port";

const upgradeFrequency = Duration.decode("7 days");

/**
 * Update check service for managing upgrade prompts
 * This is app-level logic for upgrade checking
 */
export interface UpdateChecker {
  runPeriodicUpgradeCheck(): Effect.Effect<void, ConfigError | UnknownError, RunStorePortTag>;
}

// Individual functions implementing the service methods
const runPeriodicUpgradeCheck = Effect.gen(function* () {
  const runStore = yield* RunStorePortTag;
  const commandName = process.argv[2] || "help";

  // Check if we should prompt for an update (only if not running upgrade command)
  if (commandName !== "upgrade") {
    const recentRuns = yield* runStore.getRecentRuns(100); // Get recent runs to search

    // Find the most recent upgrade command
    const lastUpgradeRun = recentRuns.find((run) => run.command_name === "upgrade");

    const currentTime = yield* Clock.currentTimeMillis;
    const shouldUpdate =
      !lastUpgradeRun ||
      (lastUpgradeRun && currentTime - lastUpgradeRun.started_at.getTime() > Duration.toMillis(upgradeFrequency));

    if (shouldUpdate) {
      yield* Effect.logInfo("🔄 [dev] It's been more than 7 days since your last upgrade.");
      yield* Effect.logInfo("💡 [dev] Run 'dev upgrade' to update your CLI tool and development environment.");
      yield* Effect.logInfo("");
    }
  }
}).pipe(
  Effect.catchAll((error) => {
    return Effect.gen(function* () {
      yield* Effect.logInfo(
        `WARN: ⚠️  Warning: ${error._tag === "UnknownError" ? String(error.reason) : "Could not check last run timestamp"}`,
      );
      // Proceed even if we can't check the timestamp, to not break main functionality
    });
  }),
);

// Functional service implementation as plain object
export const UpdateCheckerLive: UpdateChecker = {
  runPeriodicUpgradeCheck: () => runPeriodicUpgradeCheck,
};

// Service tag for Effect Context system
export class UpdateCheckerTag extends Context.Tag("UpdateChecker")<UpdateCheckerTag, UpdateChecker>() {}

// Layer that provides UpdateCheckService (no `new` keyword)
export const UpdateCheckerLiveLayer = Layer.effect(UpdateCheckerTag, Effect.succeed(UpdateCheckerLive));
