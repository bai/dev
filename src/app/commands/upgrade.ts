import { Command, Options } from "@effect/cli";
import { Effect } from "effect";

import { ConfigLoaderTag, type ConfigLoader } from "../../config/loader";
import { unknownError, type DevError } from "../../domain/errors";
import { FileSystemPortTag, type FileSystemPort } from "../../domain/ports/file-system-port";
import { GitPortTag, type GitPort } from "../../domain/ports/git-port";
import { ShellPortTag, type ShellPort } from "../../domain/ports/shell-port";
import { ToolManagementPortTag, type ToolManagementPort } from "../../domain/ports/tool-management-port";
import { PathServiceTag, type PathService } from "../../domain/services/path-service";

// No options needed for upgrade command

// Create the upgrade command using @effect/cli
export const upgradeCommand = Command.make(
  "upgrade",
  {},
  () =>
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

      // Step 4: Refresh remote configuration
      yield* Effect.logInfo("🔄 Refreshing configuration from remote...");
      const configResult = yield* configLoader.refresh();
      yield* Effect.logInfo("✅ Configuration refreshed successfully");

      // Step 5: Tool version checks and upgrades
      yield* upgradeEssentialTools();

      // Step 6: Final success message and usage examples
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
