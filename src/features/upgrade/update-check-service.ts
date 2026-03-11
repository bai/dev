import { Clock, Duration, Effect, Layer } from "effect";

import { RunStore, type RunStoreService } from "~/capabilities/persistence/run-store-port";
import { AutoUpgradeTrigger } from "~/capabilities/system/auto-upgrade-trigger-port";
import { type ConfigError, type UnknownError } from "~/core/errors";
import { InstallPaths, type InstallPathsService } from "~/core/runtime/path-service";
import { RuntimeContext, type RuntimeContextService } from "~/core/runtime/runtime-context-port";

const upgradeFrequency = Duration.decode("1 day");
export type TriggerAutoUpgrade = () => Effect.Effect<void, UnknownError>;

/**
 * Update check service for managing upgrade prompts
 * This is app-level logic for upgrade checking
 */
export interface UpdateCheckerService {
  runPeriodicUpgradeCheck(): Effect.Effect<void, ConfigError | UnknownError>;
}

export const makeUpdateChecker = (
  runStore: RunStoreService,
  triggerAutoUpgrade: TriggerAutoUpgrade,
  runtimeContext: RuntimeContextService,
  installPaths: InstallPathsService,
): UpdateCheckerService => {
  const runPeriodicUpgradeCheck = (): Effect.Effect<void, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      if (!installPaths.upgradeCapable) {
        return;
      }

      const commandName = runtimeContext.getArgv()[2] || "help";
      if (commandName === "upgrade") {
        return;
      }

      const recentRuns = yield* runStore.getRecentRuns(100); // Get recent runs to search

      // Find the most recent upgrade command
      const lastUpgradeRun = recentRuns.find((run) => run.commandName === "upgrade");

      const currentTime = yield* Clock.currentTimeMillis;
      const shouldUpdate = !lastUpgradeRun || currentTime - lastUpgradeRun.startedAt.getTime() > Duration.toMillis(upgradeFrequency);

      if (shouldUpdate) {
        yield* Effect.logInfo("🔄 [dev] Starting automatic background upgrade...");
        yield* triggerAutoUpgrade().pipe(
          Effect.tap(() => Effect.logInfo("✅ [dev] Auto-upgrade started in background.")),
          Effect.catchTag("UnknownError", (error) => Effect.logWarning(`⚠️  [dev] Failed to auto-start upgrade: ${error.message}`)),
        );
      }
    }).pipe(
      Effect.catchTags({
        UnknownError: (error) => Effect.logInfo(`WARN: ⚠️  Warning: ${error.message}`),
        ConfigError: () => Effect.logInfo("WARN: ⚠️  Warning: Could not check last run timestamp"),
      }),
    );

  return {
    runPeriodicUpgradeCheck,
  };
};

export class UpdateChecker extends Effect.Service<UpdateCheckerService>()("UpdateChecker", {
  dependencies: [Layer.service(RunStore), Layer.service(AutoUpgradeTrigger), Layer.service(RuntimeContext), Layer.service(InstallPaths)],
  effect: Effect.gen(function* () {
    const runStore = yield* RunStore;
    const autoUpgradeTrigger = yield* AutoUpgradeTrigger;
    const runtimeContext = yield* RuntimeContext;
    const installPaths = yield* InstallPaths;
    return makeUpdateChecker(runStore, () => autoUpgradeTrigger.trigger(), runtimeContext, installPaths);
  }),
}) {}

export const UpdateCheckerLiveLayer = UpdateChecker.Default;
