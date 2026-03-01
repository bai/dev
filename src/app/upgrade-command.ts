import { Command } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistryTag, type RegisteredCommand } from "../domain/command-registry-port";
import { ConfigLoaderTag } from "../domain/config-loader-port";
import { configSchema, type Config } from "../domain/config-schema";
import { unknownError, type DevError } from "../domain/errors";
import { FileSystemTag } from "../domain/file-system-port";
import { GitTag } from "../domain/git-port";
import { MiseTag } from "../domain/mise-port";
import { PathServiceTag, type PathService } from "../domain/path-service";
import { ShellTag } from "../domain/shell-port";
import { ToolManagementTag, type ToolManagement } from "../domain/tool-management-port";

// No options needed for upgrade command

/**
 * Display help for the upgrade command
 */
export const displayHelp = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Upgrade the dev CLI tool and all essential development tools\n");

    yield* Effect.logInfo("USAGE");
    yield* Effect.logInfo("  dev upgrade\n");

    yield* Effect.logInfo("EXAMPLES");
    yield* Effect.logInfo("  dev upgrade                # Update CLI and all essential tools\n");
  });

// Create the upgrade command using @effect/cli
export const upgradeCommand = Command.make("upgrade", {}, () =>
  Effect.gen(function* () {
    const configLoader = yield* ConfigLoaderTag;
    const pathService = yield* PathServiceTag;

    yield* Effect.logInfo("🔄 Upgrading dev CLI tool...");

    // Step 1: Self-update the CLI repository
    yield* selfUpdateCli(pathService).pipe(Effect.withSpan("cli.self_update"));

    // Step 2: Ensure necessary directories exist
    yield* ensureDirectoriesExist(pathService).pipe(Effect.withSpan("directory.ensure"));

    // Step 3: Update shell integration
    yield* ensureShellIntegration(pathService).pipe(Effect.withSpan("shell.ensure_integration"));

    // Step 4: Ensure local config has correct remote URL, then refresh from remote
    yield* Effect.logInfo("🔄 Updating local config with correct remote URL...");
    yield* ensureCorrectConfigUrl(pathService).pipe(Effect.withSpan("config.ensure_url"));
    yield* Effect.logInfo("🔄 Refreshing dev configuration from remote...");
    const refreshedConfig = yield* configLoader.refresh().pipe(Effect.withSpan("config.refresh"));
    yield* Effect.logInfo("✅ Configuration refreshed successfully");

    // Step 5: Setup mise global configuration from refreshed config
    yield* setupMiseGlobalConfiguration(refreshedConfig).pipe(Effect.withSpan("mise.setup_global"));

    // Step 6: Tool version checks and upgrades
    yield* upgradeEssentialTools().pipe(Effect.withSpan("tools.upgrade_essential"));

    // Step 7: Final success message and usage examples
    yield* showSuccessMessage().pipe(Effect.withSpan("ui.show_success"));
  }).pipe(Effect.withSpan("upgrade.execute")),
);

/**
 * Self-update the CLI repository
 */
function selfUpdateCli(pathService: PathService): Effect.Effect<void, DevError, FileSystemTag | GitTag | ShellTag> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🔄 Self-updating CLI repository...");

    const fileSystem = yield* FileSystemTag;
    const git = yield* GitTag;
    const shell = yield* ShellTag;

    // Check if we're in a git repository
    const isGitRepo = yield* git.isGitRepository(pathService.devDir).pipe(Effect.withSpan("git.check_repository"));
    yield* Effect.annotateCurrentSpan("git.repository.exists", isGitRepo.toString());

    if (!isGitRepo) {
      yield* Effect.logInfo("📝 Not in a git repository, skipping self-update");
      return;
    }

    // Pull latest changes
    yield* git.pullLatestChanges(pathService.devDir).pipe(
      Effect.tap(() => Effect.logInfo("✅ CLI repository updated successfully")),
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logWarning(
            `⚠️  Failed to pull latest changes: ${error.reason || error.message || "Unknown error"}`,
          );
          yield* Effect.logInfo("📝 Continuing with the rest of the upgrade process...");
        }),
      ),
    );

    // Run bun install to update dependencies
    yield* Effect.logInfo("📦 Installing/updating dependencies...");
    yield* shell.exec("bun", ["install"], { cwd: pathService.devDir }).pipe(
      Effect.mapError((error) => unknownError(`Failed to install dependencies: ${error.message}`)),
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return unknownError(`bun install failed with exit code ${result.exitCode}: ${result.stderr}`);
        }
        return Effect.succeed(result);
      }),
      Effect.tap(() => Effect.logInfo("✅ Dependencies updated successfully")),
      Effect.catchAll((error) =>
        Effect.gen(function* () {
          yield* Effect.logWarning(
            `⚠️  Failed to install dependencies: ${error.reason || error.message || "Unknown error"}`,
          );
          yield* Effect.logInfo("📝 Continuing with the rest of the upgrade process...");
        }),
      ),
    );
  });
}

/**
 * Ensure necessary directories exist
 */
function ensureDirectoriesExist(pathService: PathService): Effect.Effect<void, DevError, FileSystemTag> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("📁 Ensuring necessary directories exist...");

    const fileSystem = yield* FileSystemTag;

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
function ensureShellIntegration(pathService: PathService): Effect.Effect<void, DevError, FileSystemTag> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🐚 Ensuring shell integration...");

    const fileSystem = yield* FileSystemTag;

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
export function ensureCorrectConfigUrl(pathService: PathService): Effect.Effect<void, DevError, FileSystemTag> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystemTag;

    // Step 1: Read the project config to get the authoritative configUrl
    const projectConfigPath = `${pathService.devDir}/config.json`;
    const projectConfigExists = yield* fileSystem.exists(projectConfigPath);

    if (!projectConfigExists) {
      return yield* unknownError("Project config.json not found. Cannot determine source of truth config URL.");
    }

    const projectConfigContent = yield* fileSystem.readFile(projectConfigPath);
    let projectConfig: Config;

    try {
      projectConfig = Bun.JSONC.parse(projectConfigContent) as Config;
    } catch (error) {
      return yield* unknownError(`Invalid project config.json: ${error}`);
    }

    if (!projectConfig.configUrl) {
      return yield* unknownError("No configUrl found in project config.json");
    }

    // Step 2: Read the current local config
    const localConfigPath = `${pathService.configDir}/config.json`;
    const localConfigExists = yield* fileSystem.exists(localConfigPath);

    let localConfig: Config;
    if (localConfigExists) {
      const localConfigContent = yield* fileSystem.readFile(localConfigPath);
      try {
        localConfig = Bun.JSONC.parse(localConfigContent) as Config;
      } catch (error) {
        return yield* unknownError(`Invalid local config.json: ${error}`);
      }
    } else {
      // If local config doesn't exist, create minimal config with correct URL
      // Use schema parsing to apply all defaults
      localConfig = configSchema.parse({
        configUrl: projectConfig.configUrl,
        defaultOrg: projectConfig.defaultOrg || "default",
      });
    }

    // Step 3: Update configUrl if it's different
    if (localConfig.configUrl !== projectConfig.configUrl) {
      yield* Effect.logDebug(`📝 Updating configUrl from ${localConfig.configUrl} to ${projectConfig.configUrl}`);
      const updatedConfig = { ...localConfig, configUrl: projectConfig.configUrl };

      const updatedConfigContent = JSON.stringify(updatedConfig, null, 2);
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
function setupMiseGlobalConfiguration(config: Config): Effect.Effect<void, DevError, MiseTag> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🔧 Setting up mise global configuration...");

    const misePort = yield* MiseTag;

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
function upgradeEssentialTools(): Effect.Effect<void, DevError, ToolManagementTag> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🛠️ Checking essential tools...");

    const toolManagement = yield* ToolManagementTag;

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
function checkTool(toolName: string, toolManager: ToolManagement[keyof ToolManagement]): Effect.Effect<void, DevError> {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("tool.name", toolName);
    const { isValid, currentVersion } = yield* toolManager.checkVersion().pipe(
      Effect.mapError((error) => unknownError(`${toolName} version check failed: ${error}`)),
      Effect.withSpan(`tools.check_${toolName.toLowerCase()}_version`),
    );

    yield* Effect.annotateCurrentSpan("tool.version.valid", isValid.toString());
    if (currentVersion) {
      yield* Effect.annotateCurrentSpan("tool.version.current", currentVersion);
    }

    if (isValid && currentVersion) {
      // Version is valid, no upgrade needed
      yield* Effect.logInfo(`✅ ${toolName} ${currentVersion} is up to date`);
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
function showSuccessMessage(): Effect.Effect<void, DevError, never> {
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

/**
 * Register the upgrade command with the command registry
 */
export const registerUpgradeCommand: Effect.Effect<void, never, CommandRegistryTag> = Effect.gen(function* () {
  const registry = yield* CommandRegistryTag;
  yield* registry.register({
    name: "upgrade",
    command: upgradeCommand as RegisteredCommand,
    displayHelp,
  });
});
