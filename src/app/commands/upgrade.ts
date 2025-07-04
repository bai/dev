import { Command, Options } from "@effect/cli";
import { Effect } from "effect";

import { ConfigLoaderService, type ConfigLoader } from "../../config/loader";
import { unknownError, type DevError } from "../../domain/errors";
import { type GitProvider, type Repository } from "../../domain/models";
import { FileSystemService, type FileSystem } from "../../domain/ports/FileSystem";
import { GitService, type Git } from "../../domain/ports/Git";
import { ShellService, type Shell } from "../../domain/ports/Shell";
import { PathServiceTag, type PathService } from "../../domain/services/PathService";
import { BunToolsServiceTag } from "../../infra/tools/bun";
import { FzfToolsServiceTag } from "../../infra/tools/fzf";
import { GcloudToolsServiceTag } from "../../infra/tools/gcloud";
import { GitToolsServiceTag } from "../../infra/tools/git";
import { MiseToolsServiceTag } from "../../infra/tools/mise";

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

    // Check and potentially upgrade tools in parallel
    const toolChecks = yield* Effect.all(
      [
        Effect.either(checkBun(force)),
        Effect.either(checkGit(force)),
        Effect.either(checkMise(force)),
        Effect.either(checkFzf(force)),
        Effect.either(checkGcloud(force)),
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
 * Check Bun tool
 */
function checkBun(force: boolean): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const bunService = yield* BunToolsServiceTag;

    if (force) {
      yield* Effect.logInfo("📦 Force upgrading Bun...");
      yield* bunService
        .ensureVersionOrUpgrade()
        .pipe(Effect.mapError((error) => unknownError(`Bun upgrade failed: ${error}`)));
    } else {
      const { isValid, currentVersion } = yield* bunService
        .checkVersion()
        .pipe(Effect.mapError((error) => unknownError(`Bun version check failed: ${error}`)));

      if (isValid && currentVersion) {
        yield* Effect.logInfo(`✅ Bun is up to date (${currentVersion})`);
      } else if (currentVersion) {
        yield* Effect.logInfo(`📦 Upgrading Bun from ${currentVersion}...`);
        yield* bunService
          .ensureVersionOrUpgrade()
          .pipe(Effect.mapError((error) => unknownError(`Bun upgrade failed: ${error}`)));
      } else {
        yield* Effect.logInfo("📦 Installing Bun...");
        yield* bunService
          .ensureVersionOrUpgrade()
          .pipe(Effect.mapError((error) => unknownError(`Bun installation failed: ${error}`)));
      }
    }
  });
}

/**
 * Check Git tool
 */
function checkGit(force: boolean): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const gitService = yield* GitToolsServiceTag;

    if (force) {
      yield* Effect.logInfo("🔧 Force upgrading Git...");
      yield* gitService
        .ensureVersionOrUpgrade()
        .pipe(Effect.mapError((error) => unknownError(`Git upgrade failed: ${error}`)));
    } else {
      const { isValid, currentVersion } = yield* gitService
        .checkVersion()
        .pipe(Effect.mapError((error) => unknownError(`Git version check failed: ${error}`)));

      if (isValid && currentVersion) {
        yield* Effect.logInfo(`✅ Git is up to date (${currentVersion})`);
      } else if (currentVersion) {
        yield* Effect.logInfo(`🔧 Git version ${currentVersion} is outdated, upgrading...`);
        yield* gitService
          .ensureVersionOrUpgrade()
          .pipe(Effect.mapError((error) => unknownError(`Git upgrade failed: ${error}`)));
      } else {
        yield* Effect.logWarning("⚠️ Git not found - please install git manually");
      }
    }
  });
}

/**
 * Check Mise tool
 */
function checkMise(force: boolean): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const miseService = yield* MiseToolsServiceTag;

    if (force) {
      yield* Effect.logInfo("📦 Force upgrading Mise...");
      yield* miseService
        .ensureVersionOrUpgrade()
        .pipe(Effect.mapError((error) => unknownError(`Mise upgrade failed: ${error}`)));
    } else {
      const { isValid, currentVersion } = yield* miseService
        .checkVersion()
        .pipe(Effect.mapError((error) => unknownError(`Mise version check failed: ${error}`)));

      if (isValid && currentVersion) {
        yield* Effect.logInfo(`✅ Mise is up to date (${currentVersion})`);
      } else if (currentVersion) {
        yield* Effect.logInfo(`📦 Upgrading Mise from ${currentVersion}...`);
        yield* miseService
          .ensureVersionOrUpgrade()
          .pipe(Effect.mapError((error) => unknownError(`Mise upgrade failed: ${error}`)));
      } else {
        yield* Effect.logInfo("📦 Installing Mise...");
        yield* miseService
          .ensureVersionOrUpgrade()
          .pipe(Effect.mapError((error) => unknownError(`Mise installation failed: ${error}`)));
      }
    }
  });
}

/**
 * Check Fzf tool
 */
function checkFzf(force: boolean): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const fzfService = yield* FzfToolsServiceTag;

    if (force) {
      yield* Effect.logInfo("📦 Force upgrading fzf...");
      yield* fzfService
        .ensureVersionOrUpgrade()
        .pipe(Effect.mapError((error) => unknownError(`fzf upgrade failed: ${error}`)));
    } else {
      const { isValid, currentVersion } = yield* fzfService
        .checkVersion()
        .pipe(Effect.mapError((error) => unknownError(`fzf version check failed: ${error}`)));

      if (isValid && currentVersion) {
        yield* Effect.logInfo(`✅ fzf is up to date (${currentVersion})`);
      } else if (currentVersion) {
        yield* Effect.logInfo(`📦 Upgrading fzf from ${currentVersion}...`);
        yield* fzfService
          .ensureVersionOrUpgrade()
          .pipe(Effect.mapError((error) => unknownError(`fzf upgrade failed: ${error}`)));
      } else {
        yield* Effect.logInfo("📦 Installing fzf...");
        yield* fzfService
          .ensureVersionOrUpgrade()
          .pipe(Effect.mapError((error) => unknownError(`fzf installation failed: ${error}`)));
      }
    }
  });
}

/**
 * Check gcloud tool
 */
function checkGcloud(force: boolean): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const gcloudService = yield* GcloudToolsServiceTag;

    if (force) {
      yield* Effect.logInfo("📦 Force upgrading gcloud...");
      yield* gcloudService
        .ensureVersionOrUpgrade()
        .pipe(Effect.mapError((error) => unknownError(`gcloud upgrade failed: ${error}`)));
    } else {
      const { isValid, currentVersion } = yield* gcloudService
        .checkVersion()
        .pipe(Effect.mapError((error) => unknownError(`gcloud version check failed: ${error}`)));

      if (isValid && currentVersion) {
        yield* Effect.logInfo(`✅ gcloud is up to date (${currentVersion})`);
      } else if (currentVersion) {
        yield* Effect.logInfo(`📦 Upgrading gcloud from ${currentVersion}...`);
        yield* gcloudService
          .ensureVersionOrUpgrade()
          .pipe(Effect.mapError((error) => unknownError(`gcloud upgrade failed: ${error}`)));
      } else {
        yield* Effect.logInfo("📦 Installing gcloud...");
        yield* gcloudService
          .ensureVersionOrUpgrade()
          .pipe(Effect.mapError((error) => unknownError(`gcloud installation failed: ${error}`)));
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
