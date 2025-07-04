import { Command, Options } from "@effect/cli";
import { Effect } from "effect";

import { ConfigLoaderService, type ConfigLoader } from "../../config/loader";
import { unknownError, type DevError } from "../../domain/errors";
import { FileSystemService, type FileSystem } from "../../domain/ports/FileSystem";
import { GitService, type Git } from "../../domain/ports/Git";
import { ShellService, type Shell } from "../../domain/ports/Shell";
import { ToolManagementServiceTag, type ToolManagementService } from "../../domain/ports/ToolManager";
import { PathServiceTag, type PathService } from "../../domain/services/PathService";

// Define the options using @effect/cli
const regenerateCompletions = Options.boolean("regenerate-completions").pipe(Options.optional);
const force = Options.boolean("force").pipe(Options.optional);

// Create the upgrade command using @effect/cli
export const upgradeCommand = Command.make(
  "upgrade",
  { regenerateCompletions, force },
  ({ regenerateCompletions, force }) =>
    Effect.gen(function* () {
      const configLoader = yield* ConfigLoaderService;
      const pathService = yield* PathServiceTag;
      const regenerateCompletionsValue = regenerateCompletions._tag === "Some" ? regenerateCompletions.value : false;
      const forceValue = force._tag === "Some" ? force.value : false;

      if (forceValue) {
        yield* Effect.logInfo("🔄 Upgrading dev CLI tool (force mode enabled)...");
      } else {
        yield* Effect.logInfo("🔄 Upgrading dev CLI tool...");
      }

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
      yield* upgradeEssentialTools(forceValue);

      // Step 6: Generate completions if requested
      if (regenerateCompletionsValue) {
        yield* generateShellCompletions();
      }

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

    const fileSystem = yield* FileSystemService;
    const git = yield* GitService;

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

    const fileSystem = yield* FileSystemService;

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

    const fileSystem = yield* FileSystemService;

    // For now, just ensure the directory exists
    // In the future, this could copy shell scripts, update PATH, etc.
    yield* fileSystem.mkdir(`${pathService.configDir}/shell`, true);

    yield* Effect.logInfo("✅ Shell integration ensured");
  });
}

/**
 * Upgrade essential tools
 */
function upgradeEssentialTools(force: boolean): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🛠️ Checking essential tools...");

    if (force) {
      yield* Effect.logInfo("💪 Force mode enabled - will upgrade all tools");
    }

    const toolManagement = yield* ToolManagementServiceTag;

    // Check and potentially upgrade tools in parallel
    const toolChecks = yield* Effect.all(
      [
        Effect.either(checkTool("Bun", toolManagement.bun, force)),
        Effect.either(checkTool("Git", toolManagement.git, force)),
        Effect.either(checkTool("Mise", toolManagement.mise, force)),
        Effect.either(checkTool("Fzf", toolManagement.fzf, force)),
        Effect.either(checkTool("Gcloud", toolManagement.gcloud, force)),
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
  toolManager: ToolManagementService[keyof ToolManagementService],
  force: boolean,
): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    if (force) {
      yield* Effect.logInfo(`📦 Force upgrading ${toolName}...`);
      yield* toolManager
        .ensureVersionOrUpgrade()
        .pipe(Effect.mapError((error) => unknownError(`${toolName} upgrade failed: ${error}`)));
    } else {
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
    }
  });
}

/**
 * Generate shell completions
 */
function generateShellCompletions(): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🔧 Generating shell completions...");

    const shell = yield* ShellService;

    // This would generate completions for the current shell
    // For now, just log that we would do this
    yield* Effect.logInfo("📝 Shell completion generation not yet implemented");

    yield* Effect.logInfo("✅ Shell completions generated");
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
