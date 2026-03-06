import { Command } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistryTag, type RegisteredCommand } from "../domain/command-registry-port";
import { type ConfigLoader, ConfigLoaderTag } from "../domain/config-loader-port";
import { configSchema, type Config } from "../domain/config-schema";
import {
  configError,
  type ExternalToolError,
  externalToolError,
  extractErrorMessage,
  type ShellExecutionError,
  shellExecutionError,
  unknownError,
  type UnknownError,
  type DevError,
} from "../domain/errors";
import { FileSystemTag } from "../domain/file-system-port";
import { GitTag } from "../domain/git-port";
import { MiseTag } from "../domain/mise-port";
import { PathServiceTag, type PathService } from "../domain/path-service";
import { ShellTag } from "../domain/shell-port";
import { ToolManagementTag, type ToolManager } from "../domain/tool-management-port";

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
    yield* ensureCorrectConfigUrl(pathService, configLoader).pipe(Effect.withSpan("config.ensure_url"));
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
export function selfUpdateCli(pathService: PathService): Effect.Effect<void, DevError, GitTag | ShellTag> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🔄 Self-updating CLI repository...");

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
    yield* git.pullLatestChanges(pathService.devDir).pipe(Effect.tap(() => Effect.logInfo("✅ CLI repository updated successfully")));

    // Run bun install to update dependencies
    yield* Effect.logInfo("📦 Installing/updating dependencies...");
    yield* shell.exec("bun", ["install"], { cwd: pathService.devDir }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(
            externalToolError("Failed to install CLI dependencies", {
              tool: "bun",
              exitCode: result.exitCode,
              stderr: result.stderr,
            }),
          );
        }
        return Effect.succeed(result);
      }),
      Effect.tap(() => Effect.logInfo("✅ Dependencies updated successfully")),
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
export function ensureCorrectConfigUrl(pathService: PathService, configLoader: ConfigLoader): Effect.Effect<void, DevError, FileSystemTag> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystemTag;

    // Step 1: Read the project config to get the authoritative configUrl
    const projectConfigPath = `${pathService.devDir}/config.json`;
    const projectConfigExists = yield* fileSystem.exists(projectConfigPath);

    if (!projectConfigExists) {
      return yield* configError("Project config.json not found. Cannot determine source of truth config URL.");
    }

    const projectConfigContent = yield* fileSystem.readFile(projectConfigPath);
    const projectConfig = yield* configLoader.parse(projectConfigContent, "project config.json");

    if (!projectConfig.configUrl) {
      return yield* configError("No configUrl found in project config.json");
    }

    // Step 2: Read the current local config
    const localConfigPath = `${pathService.configDir}/config.json`;
    const localConfigExists = yield* fileSystem.exists(localConfigPath);

    const localConfig = localConfigExists
      ? yield* fileSystem.readFile(localConfigPath).pipe(Effect.flatMap((content) => configLoader.parse(content, "local config.json")))
      : configSchema.parse({
          configUrl: projectConfig.configUrl,
          defaultOrg: projectConfig.defaultOrg || "default",
        });

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
      yield* Effect.logDebug(`📝 Found mise global config with ${Object.keys(config.miseGlobalConfig.tools || {}).length} tools`);

      yield* misePort.setupGlobalConfig().pipe(Effect.mapError((error) => unknownError(`Mise config setup failed: ${error}`)));

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
export function upgradeEssentialTools(): Effect.Effect<void, DevError, ToolManagementTag> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🛠️ Checking essential tools...");

    const toolManagement = yield* ToolManagementTag;
    const essentialTools = toolManagement.listEssentialTools();

    yield* Effect.forEach(essentialTools, (tool) => checkTool(tool.displayName, tool.manager).pipe(Effect.withSpan("tools.upgrade_one")), {
      discard: true,
    });

    yield* Effect.logInfo("✅ Essential tools checked");
  });
}

/**
 * Generic function to check and upgrade a tool
 */
export function checkTool(toolName: string, toolManager: ToolManager): Effect.Effect<void, DevError> {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("tool.name", toolName);
    const { isValid, currentVersion } = yield* toolManager
      .checkVersion()
      .pipe(prefixToolManagerError(toolName, "version check"), Effect.withSpan("tools.check_version"));

    yield* Effect.annotateCurrentSpan("tool.version.valid", isValid.toString());
    if (currentVersion) {
      yield* Effect.annotateCurrentSpan("tool.version.current", currentVersion);
    }

    if (isValid && currentVersion) {
      // Version is valid, no upgrade needed
      yield* Effect.logInfo(`✅ ${toolName} ${currentVersion} is up to date`);
    } else if (currentVersion) {
      yield* Effect.logInfo(`📦 Upgrading ${toolName} from ${currentVersion}...`);
      yield* toolManager.ensureVersionOrUpgrade().pipe(prefixToolManagerError(toolName, "upgrade"));
    } else {
      yield* Effect.logInfo(`📦 Installing ${toolName}...`);
      yield* toolManager.ensureVersionOrUpgrade().pipe(prefixToolManagerError(toolName, "installation"));
    }
  });
}

const prefixToolManagerError = <E extends ExternalToolError | ShellExecutionError | UnknownError>(toolName: string, action: string) =>
  Effect.mapError((error: E): E => {
    switch (error._tag) {
      case "ExternalToolError":
        return externalToolError(`${toolName} ${action} failed: ${error.message}`, {
          tool: error.tool,
          exitCode: error.exitCode,
          stderr: error.stderr,
        }) as E;
      case "ShellExecutionError":
        return shellExecutionError(error.command, error.args, `${toolName} ${action} failed: ${error.reason}`, {
          cwd: error.cwd,
          underlyingError: error.underlyingError,
        }) as E;
      case "UnknownError":
        return unknownError(`${toolName} ${action} failed: ${extractErrorMessage(error.reason)}`) as E;
    }
  });

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
