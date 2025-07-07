import { Command } from "@effect/cli";
import { Effect } from "effect";

import { ConfigLoaderTag } from "../config/loader";
import { type Config } from "../config/schema";
import { unknownError, type DevError } from "../domain/errors";
import { FileSystemPortTag } from "../domain/file-system-port";
import { GitPortTag } from "../domain/git-port";
import { MisePortTag } from "../domain/mise-port";
import { PathServiceTag, type PathService } from "../domain/path-service";
import { ToolManagementPortTag, type ToolManagementPort } from "../domain/tool-management-port";

// No options needed for upgrade command

// Create the upgrade command using @effect/cli
export const upgradeCommand = Command.make("upgrade", {}, () =>
  Effect.gen(function* () {
    const configLoader = yield* ConfigLoaderTag;
    const pathService = yield* PathServiceTag;

    yield* Effect.logInfo("🔄 Upgrading dev CLI tool...");

    // Step 1: Self-update the CLI repository
    yield* selfUpdateCli(pathService);

    // Step 2: Ensure necessary directories exist
    yield* ensureDirectoriesExist(pathService);

    // Step 3: Update shell integration
    yield* ensureShellIntegration(pathService);

    // Step 4: Ensure local config has correct remote URL, then refresh from remote
    yield* Effect.logInfo("🔄 Updating local config with correct remote URL...");
    yield* ensureCorrectConfigUrl(pathService);
    yield* Effect.logInfo("🔄 Refreshing dev configuration from remote...");
    const refreshedConfig = yield* configLoader.refresh();
    yield* Effect.logInfo("✅ Configuration refreshed successfully");

    // Step 5: Setup mise global configuration from refreshed config
    yield* setupMiseGlobalConfiguration(refreshedConfig);

    // Step 6: Tool version checks and upgrades
    yield* upgradeEssentialTools();

    // Step 7: Final success message and usage examples
    yield* showSuccessMessage();
  }),
);

/**
 * Self-update the CLI repository
 */
function selfUpdateCli(pathService: PathService): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🔄 Self-updating CLI repository...");

    const fileSystem = yield* FileSystemPortTag;
    const git = yield* GitPortTag;

    // Check if we're in a git repository
    const isGitRepo = yield* git.isGitRepository(pathService.devDir);

    if (!isGitRepo) {
      yield* Effect.logInfo("📝 Not in a git repository, skipping self-update");
      return;
    }

    // Fetch latest updates
    yield* git.fetchLatestUpdates(pathService.devDir);
    yield* Effect.logInfo("✅ CLI repository updated successfully");
  });
}

/**
 * Ensure necessary directories exist
 */
function ensureDirectoriesExist(pathService: PathService): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("📁 Ensuring necessary directories exist...");

    const fileSystem = yield* FileSystemPortTag;

    // Ensure config directory exists
    yield* fileSystem.mkdir(pathService.configDir, true);

    // Ensure data directory exists
    yield* fileSystem.mkdir(pathService.dataDir, true);

    // Ensure cache directory exists
    yield* fileSystem.mkdir(pathService.cacheDir, true);

    yield* Effect.logInfo("✅ Directories ensured successfully");
  });
}

/**
 * Update shell integration
 */
function ensureShellIntegration(pathService: PathService): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🐚 Ensuring shell integration...");

    const fileSystem = yield* FileSystemPortTag;

    // For now, just ensure the directory exists
    // In the future, this could copy shell scripts, update PATH, etc.
    yield* fileSystem.mkdir(`${pathService.configDir}/shell`, true);

    yield* Effect.logInfo("✅ Shell integration ensured");
  });
}

/**
 * Ensure local config has the correct configUrl from project config
 * This updates only the configUrl field so that configLoader.refresh() works correctly
 */
function ensureCorrectConfigUrl(pathService: PathService): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystemPortTag;

    // Step 1: Read the project config to get the authoritative configUrl
    const projectConfigPath = `${pathService.devDir}/config.json`;
    const projectConfigExists = yield* fileSystem.exists(projectConfigPath);

    if (!projectConfigExists) {
      return yield* Effect.fail(
        unknownError("Project config.json not found. Cannot determine source of truth config URL."),
      );
    }

    const projectConfigContent = yield* fileSystem.readFile(projectConfigPath);
    let projectConfig: Config;

    try {
      projectConfig = JSON.parse(projectConfigContent);
    } catch (error) {
      return yield* Effect.fail(unknownError(`Invalid project config.json: ${error}`));
    }

    if (!projectConfig.configUrl) {
      return yield* Effect.fail(unknownError("No configUrl found in project config.json"));
    }

    // Step 2: Read the current local config
    const localConfigPath = `${pathService.configDir}/config.json`;
    const localConfigExists = yield* fileSystem.exists(localConfigPath);

    let localConfig: Config;
    if (localConfigExists) {
      const localConfigContent = yield* fileSystem.readFile(localConfigPath);
      try {
        localConfig = JSON.parse(localConfigContent);
      } catch (error) {
        return yield* Effect.fail(unknownError(`Invalid local config.json: ${error}`));
      }
    } else {
      // If local config doesn't exist, create minimal config with correct URL
      localConfig = {
        version: 3,
        configUrl: projectConfig.configUrl,
        defaultOrg: projectConfig.defaultOrg || "default",
        telemetry: { enabled: true },
      };
    }

    // Step 3: Update configUrl if it's different
    if (localConfig.configUrl !== projectConfig.configUrl) {
      yield* Effect.logDebug(`📝 Updating configUrl from ${localConfig.configUrl} to ${projectConfig.configUrl}`);
      (localConfig as any).configUrl = projectConfig.configUrl;

      const updatedConfigContent = JSON.stringify(localConfig, null, 2);
      yield* fileSystem
        .writeFile(localConfigPath, updatedConfigContent)
        .pipe(Effect.mapError((error) => unknownError(`Failed to update local config: ${error}`)));

      yield* Effect.logDebug("✅ Local config URL updated");
    } else {
      yield* Effect.logDebug("✅ Local config URL already correct");
    }
  });
}

/**
 * Setup mise global configuration from refreshed config
 */
function setupMiseGlobalConfiguration(config: Config): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🔧 Setting up mise global configuration...");

    const misePort = yield* MisePortTag;

    if (config.miseGlobalConfig) {
      yield* Effect.logDebug(
        `📝 Found mise global config with ${Object.keys(config.miseGlobalConfig.tools || {}).length} tools`,
      );

      yield* misePort
        .setupGlobalConfig()
        .pipe(Effect.mapError((error) => unknownError(`Mise config setup failed: ${error}`)));

      yield* Effect.logInfo("✅ Mise global configuration updated successfully");
    } else {
      yield* Effect.logWarning("⚠️  No mise global config found in refreshed configuration");
      yield* Effect.logInfo("💡 Consider adding miseGlobalConfig to your remote configuration");
    }
  });
}

/**
 * Upgrade essential tools
 */
function upgradeEssentialTools(): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🛠️ Checking essential tools...");

    const toolManagement = yield* ToolManagementPortTag;

    // Check and potentially upgrade tools in parallel
    const toolChecks = yield* Effect.all(
      [
        Effect.either(checkTool("Bun", toolManagement.bun)),
        Effect.either(checkTool("Git", toolManagement.git)),
        Effect.either(checkTool("Mise", toolManagement.mise)),
        Effect.either(checkTool("Fzf", toolManagement.fzf)),
        Effect.either(checkTool("Gcloud", toolManagement.gcloud)),
      ],
      { concurrency: "unbounded" },
    );

    // Log results
    for (const result of toolChecks) {
      if (result._tag === "Left") {
        yield* Effect.logWarning(`⚠️ Tool check failed: ${result.left}`);
      }
    }

    yield* Effect.logInfo("✅ Essential tools checked");
  });
}

/**
 * Generic function to check and upgrade a tool
 */
function checkTool(
  toolName: string,
  toolManager: ToolManagementPort[keyof ToolManagementPort],
): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const { isValid, currentVersion } = yield* toolManager
      .checkVersion()
      .pipe(Effect.mapError((error) => unknownError(`${toolName} version check failed: ${error}`)));

    if (isValid && currentVersion) {
      yield* Effect.logInfo(`✅ ${toolName} is up to date (${currentVersion})`);
    } else if (currentVersion) {
      yield* Effect.logInfo(`📦 Upgrading ${toolName} from ${currentVersion}...`);
      yield* toolManager
        .ensureVersionOrUpgrade()
        .pipe(Effect.mapError((error) => unknownError(`${toolName} upgrade failed: ${error}`)));
    } else {
      yield* Effect.logInfo(`📦 Installing ${toolName}...`);
      yield* toolManager
        .ensureVersionOrUpgrade()
        .pipe(Effect.mapError((error) => unknownError(`${toolName} installation failed: ${error}`)));
    }
  });
}

/**
 * Show success message and usage examples
 */
function showSuccessMessage(): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🎉 Upgrade completed successfully!");
    yield* Effect.logInfo("");
    yield* Effect.logInfo("💡 Try these commands:");
    yield* Effect.logInfo("   dev cd                    # Navigate to a project");
    yield* Effect.logInfo("   dev clone <repo>          # Clone a repository");
    yield* Effect.logInfo("   dev up                    # Setup development environment");
    yield* Effect.logInfo("   dev run <task>            # Run a development task");
    yield* Effect.logInfo("   dev status                # Check system status");
    yield* Effect.logInfo("");
  });
}
