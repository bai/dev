import { Clock, Duration, Effect, Layer } from "effect";

import { RunStoreTag, type RunStore } from "~/capabilities/persistence/run-store-port";
import { AutoUpgradeTriggerTag } from "~/capabilities/system/auto-upgrade-trigger-port";
import { type ConfigError, type UnknownError } from "~/core/errors";
import { RuntimeContextTag, type RuntimeContext } from "~/core/runtime/runtime-context-port";

const upgradeFrequency = Duration.decode("1 day");
export type TriggerAutoUpgrade = () => Effect.Effect<void, UnknownError>;

/**
 * Update check service for managing upgrade prompts
 * This is app-level logic for upgrade checking
 */
export interface UpdateChecker {
  runPeriodicUpgradeCheck(): Effect.Effect<void, ConfigError | UnknownError>;
}

export const makeUpdateChecker = (
  runStore: RunStore,
  triggerAutoUpgrade: TriggerAutoUpgrade,
  runtimeContext: RuntimeContext,
): UpdateChecker => {
  const runPeriodicUpgradeCheck = (): Effect.Effect<void, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      const commandName = runtimeContext.getArgv()[2] || "help";

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

export class UpdateCheckerTag extends Effect.Service<UpdateChecker>()("UpdateChecker", {
  dependencies: [Layer.service(RunStoreTag), Layer.service(AutoUpgradeTriggerTag), Layer.service(RuntimeContextTag)],
  effect: Effect.gen(function* () {
    const runStore = yield* RunStoreTag;
    const autoUpgradeTrigger = yield* AutoUpgradeTriggerTag;
    const runtimeContext = yield* RuntimeContextTag;
    return makeUpdateChecker(runStore, () => autoUpgradeTrigger.trigger(), runtimeContext);
  }),
}) {}

export const UpdateCheckerLiveLayer = UpdateCheckerTag.Default;
