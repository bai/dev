import fs from "fs/promises";
import path from "path";

import { Command } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistry } from "~/bootstrap/command-registry-port";
import { FileSystem } from "~/capabilities/system/file-system-port";
import { Git } from "~/capabilities/system/git-port";
import { Shell } from "~/capabilities/system/shell-port";
import { Mise } from "~/capabilities/tools/mise-port";
import { ToolManagement, type ToolManager } from "~/capabilities/tools/tool-management-port";
import { type ConfigLoaderService, ConfigLoader } from "~/core/config/config-loader-port";
import { configSchema, type Config } from "~/core/config/config-schema";
import {
  configError,
  type ExternalToolError,
  externalToolError,
  type FileSystemError,
  type ShellExecutionError,
  shellExecutionError,
  unknownError,
  type UnknownError,
  type DevError,
} from "~/core/errors";
import { InstallPaths, StatePaths, type InstallPathsService, type StatePathsService } from "~/core/runtime/path-service";

// No options needed for upgrade command
const INSTALL_LOCK_DIR_NAME = ".dev-upgrade.lock";

const getInstallLockPath = (installPaths: InstallPathsService) => path.join(installPaths.installDir, INSTALL_LOCK_DIR_NAME);

const tryAcquireInstallLock = (lockPath: string): Effect.Effect<boolean, UnknownError> =>
  Effect.tryPromise({
    try: async () => {
      try {
        await fs.mkdir(lockPath);
        return true;
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
          return false;
        }
        throw error;
      }
    },
    catch: (error) => unknownError(`Failed to acquire install lock at ${lockPath}: ${error}`),
  });

const waitForInstallLock = (lockPath: string, remainingAttempts = 80): Effect.Effect<string, UnknownError> =>
  Effect.gen(function* () {
    const acquired = yield* tryAcquireInstallLock(lockPath);

    if (acquired) {
      return lockPath;
    }

    if (remainingAttempts <= 0) {
      return yield* unknownError(`Timed out waiting for install lock at ${lockPath}`);
    }

    yield* Effect.sleep("250 millis");
    return yield* waitForInstallLock(lockPath, remainingAttempts - 1);
  });

const releaseInstallLock = (lockPath: string): Effect.Effect<void, UnknownError> =>
  Effect.tryPromise({
    try: () => fs.rm(lockPath, { recursive: true, force: true }),
    catch: (error) => unknownError(`Failed to release install lock at ${lockPath}: ${error}`),
  });

const withInstallLock = <A, E, R>(
  installPaths: InstallPathsService,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | UnknownError, R> =>
  Effect.acquireUseRelease(
    waitForInstallLock(getInstallLockPath(installPaths)),
    () => effect,
    (lockPath) =>
      releaseInstallLock(lockPath).pipe(
        Effect.catchAll((error) => Effect.logWarning(`⚠️  Failed to release install lock cleanly: ${error.message}`)),
      ),
  );

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
    const configLoader = yield* ConfigLoader;
    const installPaths = yield* InstallPaths;
    const statePaths = yield* StatePaths;

    yield* Effect.logInfo("🔄 Upgrading dev CLI tool...");

    // Step 1: Self-update the CLI repository
    yield* selfUpdateCli(installPaths).pipe(Effect.withSpan("cli.self_update"));

    // Step 2: Ensure necessary directories exist
    yield* ensureDirectoriesExist(statePaths).pipe(Effect.withSpan("directory.ensure"));

    // Step 3: Update shell integration
    yield* ensureShellIntegration(statePaths).pipe(Effect.withSpan("shell.ensure_integration"));

    // Step 4: Ensure local config has correct remote URL, then refresh from remote
    yield* Effect.logInfo("🔄 Updating local config with correct remote URL...");
    yield* ensureCorrectConfigUrl(statePaths, installPaths, configLoader).pipe(Effect.withSpan("config.ensure_url"));
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
export function selfUpdateCli(installPaths: InstallPathsService): Effect.Effect<void, DevError, Git | Shell> {
  return Effect.gen(function* () {
    if (!installPaths.upgradeCapable) {
      yield* Effect.logInfo("📝 This dev installation is managed externally; skipping CLI self-update");
      return;
    }

    yield* Effect.logInfo("🔄 Self-updating CLI repository...");

    const git = yield* Git;
    const shell = yield* Shell;

    yield* withInstallLock(
      installPaths,
      Effect.gen(function* () {
        const isGitRepo = yield* git.isGitRepository(installPaths.installDir).pipe(Effect.withSpan("git.check_repository"));
        yield* Effect.annotateCurrentSpan("git.repository.exists", isGitRepo.toString());

        if (!isGitRepo) {
          yield* Effect.logInfo("📝 Not in a git repository, skipping self-update");
          return;
        }

        yield* git.pullLatestChanges(installPaths.installDir).pipe(
          Effect.tap(() => Effect.logInfo("✅ CLI repository updated successfully")),
          Effect.catchTag("GitError", (error) =>
            Effect.logWarning(`⚠️  Git pull failed during self-update; continuing upgrade: ${error.message}`),
          ),
        );

        yield* Effect.logInfo("📦 Installing/updating dependencies...");
        yield* shell.exec("bun", ["install"], { cwd: installPaths.installDir }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return Effect.fail(
                externalToolError("Failed to install CLI dependencies", {
                  tool: "bun",
                  toolExitCode: result.exitCode,
                  stderr: result.stderr,
                }),
              );
            }
            return Effect.succeed(result);
          }),
          Effect.tap(() => Effect.logInfo("✅ Dependencies updated successfully")),
        );
      }),
    );
  });
}

/**
 * Ensure necessary directories exist
 */
function ensureDirectoriesExist(statePaths: StatePathsService): Effect.Effect<void, DevError, FileSystem> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("📁 Ensuring necessary directories exist...");

    const fileSystem = yield* FileSystem;
    const directories = Array.from(
      new Set([
        statePaths.stateDir,
        path.dirname(statePaths.configPath),
        path.dirname(statePaths.dbPath),
        statePaths.cacheDir,
        statePaths.dockerDir,
        statePaths.runDir,
      ]),
    );

    yield* Effect.forEach(directories, (directoryPath) => fileSystem.mkdir(directoryPath, true), { discard: true });

    yield* Effect.logInfo("✅ Directories ensured successfully");
  });
}

/**
 * Update shell integration
 */
function ensureShellIntegration(statePaths: StatePathsService): Effect.Effect<void, DevError, FileSystem> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🐚 Ensuring shell integration...");

    const fileSystem = yield* FileSystem;

    yield* fileSystem.mkdir(path.join(statePaths.stateDir, "shell"), true);

    yield* Effect.logInfo("✅ Shell integration ensured");
  });
}

/**
 * Ensure local config has the correct configUrl from project config
 * This updates only the configUrl field so that configLoader.refresh() works correctly
 */
export function ensureCorrectConfigUrl(
  statePaths: StatePathsService,
  installPaths: InstallPathsService,
  configLoader: ConfigLoaderService,
): Effect.Effect<void, DevError, FileSystem> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem;

    if (installPaths.installMode !== "repo") {
      return yield* configError("Standalone binary distribution is not supported yet");
    }

    const projectConfigContent = yield* fileSystem.readFile(path.join(installPaths.installDir, "config.json"));
    const projectConfig = yield* configLoader.parse(projectConfigContent, "project config.json");

    if (!projectConfig.configUrl) {
      return yield* configError("No configUrl found in project config.json");
    }

    // Step 2: Read the current local config
    const localConfigPath = statePaths.configPath;
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
function setupMiseGlobalConfiguration(config: Config): Effect.Effect<void, DevError, Mise> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🔧 Setting up mise global configuration...");

    const misePort = yield* Mise;

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
export function upgradeEssentialTools(): Effect.Effect<void, DevError, ToolManagement> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🛠️ Checking essential tools...");

    const toolManagement = yield* ToolManagement;
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
          toolExitCode: error.toolExitCode,
          stderr: error.stderr,
        }) as E;
      case "ShellExecutionError":
        return shellExecutionError(error.command, error.args, `${toolName} ${action} failed: ${error.message}`, {
          cwd: error.cwd,
          underlyingError: error.underlyingError,
        }) as E;
      case "UnknownError":
        return unknownError(error.details, { message: `${toolName} ${action} failed: ${error.message}` }) as E;
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
export const registerUpgradeCommand: Effect.Effect<void, never, CommandRegistry> = Effect.gen(function* () {
  const registry = yield* CommandRegistry;
  yield* registry.register({
    name: "upgrade",
    command: upgradeCommand,
    displayHelp,
  });
});
