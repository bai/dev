import { Clock, Context, Duration, Effect, Layer } from "effect";

import { type ConfigError, unknownError, type UnknownError } from "../domain/errors";
import { RunStoreTag, type RunStore } from "../domain/run-store-port";

const upgradeFrequency = Duration.decode("1 day");
export type TriggerAutoUpgrade = () => Effect.Effect<void, UnknownError>;

const triggerAutoUpgradeInBackground: TriggerAutoUpgrade = () =>
  Effect.try({
    try: () => {
      const command = process.argv[0];
      const scriptPath = process.argv[1];

      if (!command || !scriptPath) {
        throw new Error("Cannot determine CLI command invocation for auto-upgrade");
      }

      const processHandle = Bun.spawn([command, scriptPath, "upgrade"], {
        cwd: process.cwd(),
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        detached: true,
        env: {
          ...process.env,
          DEV_AUTO_UPGRADE: "1",
        },
      });

      processHandle.unref();
    },
    catch: (error) => unknownError(`Failed to start auto-upgrade in background: ${error}`),
  });

/**
 * Update check service for managing upgrade prompts
 * This is app-level logic for upgrade checking
 */
export interface UpdateChecker {
  runPeriodicUpgradeCheck(): Effect.Effect<void, ConfigError | UnknownError>;
}

export const makeUpdateChecker = (
  runStore: RunStore,
  triggerAutoUpgrade: TriggerAutoUpgrade = triggerAutoUpgradeInBackground,
): UpdateChecker => {
  const runPeriodicUpgradeCheck = (): Effect.Effect<void, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      const commandName = process.argv[2] || "help";

      // Check if we should auto-upgrade (only if not running upgrade command)
      if (commandName !== "upgrade") {
        const recentRuns = yield* runStore.getRecentRuns(100); // Get recent runs to search

        // Find the most recent upgrade command
        const lastUpgradeRun = recentRuns.find((run) => run.commandName === "upgrade");

        const currentTime = yield* Clock.currentTimeMillis;
        const shouldUpdate =
          !lastUpgradeRun || (lastUpgradeRun && currentTime - lastUpgradeRun.startedAt.getTime() > Duration.toMillis(upgradeFrequency));

        if (shouldUpdate) {
          yield* Effect.logInfo("🔄 [dev] Starting automatic background upgrade...");
          yield* triggerAutoUpgrade().pipe(
            Effect.tap(() => Effect.logInfo("✅ [dev] Auto-upgrade started in background.")),
            Effect.catchTag("UnknownError", (error) =>
              Effect.logWarning(`⚠️  [dev] Failed to auto-start upgrade: ${String(error.reason)}`),
            ),
          );
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
