import { Effect } from "effect";

import { ConfigLoaderService, type ConfigLoader } from "../../config/loader";
import { unknownError, type DevError } from "../../domain/errors";
import { type CliCommandSpec, type CommandContext, type GitProvider, type Repository } from "../../domain/models";
import { FileSystemService, type FileSystem } from "../../domain/ports/FileSystem";
import { GitService, type Git } from "../../domain/ports/Git";
import { ShellService, type Shell } from "../../domain/ports/Shell";
import { PathServiceTag, type PathService } from "../../domain/services/PathService";
import { BunToolsServiceTag } from "../../infra/tools/bun";
import { FzfToolsServiceTag } from "../../infra/tools/fzf";
import { GcloudToolsServiceTag } from "../../infra/tools/gcloud";
import { GitToolsServiceTag } from "../../infra/tools/git";
import { MiseToolsServiceTag } from "../../infra/tools/mise";

export const upgradeCommand: CliCommandSpec = {
  name: "upgrade",
  description: "Upgrade the dev CLI and refresh configuration",
  help: `
Upgrade the dev CLI to the latest version:

Usage:
  dev upgrade                          # Upgrade CLI and refresh config
  dev upgrade --regenerate-completions # Also regenerate shell completions
  dev upgrade --force                  # Force overwrite mise config even if it exists

This command will:
1. Self-update the CLI via git pull and bun install
2. Ensure necessary directories exist (~/.config/dev, ~/.local/share/dev)
3. Update shell integration if needed (adds source line to ~/.zshrc)
4. Refresh remote configuration
5. Update Git plugins
6. Check and upgrade essential tools (bun, mise, git, fzf, gcloud)
7. Setup tool configurations (mise, gcloud)
8. Optionally regenerate shell completions
9. Provide usage examples
  `,

  options: [
    {
      flags: "--regenerate-completions",
      description: "Regenerate shell completions after upgrade",
    },
    {
      flags: "--force",
      description: "Force overwrite mise global config even if it exists",
    },
  ],

  exec(context: CommandContext): Effect.Effect<void, DevError, any> {
    return Effect.gen(function* () {
      const configLoader = yield* ConfigLoaderService;
      const pathService = yield* PathServiceTag;
      const regenerateCompletions = context.options["regenerate-completions"];
      const force = context.options["force"];

      if (force) {
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

      // Step 5: Update Git plugins in parallel
      yield* updateGitPlugins(configResult.plugins?.git || []);

      // Step 6: Tool version checks and upgrades
      yield* upgradeEssentialTools(force);

      // Step 7: Generate completions if requested
      if (regenerateCompletions) {
        yield* generateShellCompletions();
      }

      // Step 8: Final success message and usage examples
      yield* showSuccessMessage();
    });
  },
};

/**
 * Self-update the CLI via git pull and bun install
 */
function selfUpdateCli(pathService: PathService): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const git = yield* GitService;
    const shell = yield* ShellService;

    yield* Effect.logInfo("📦 Updating dev CLI repository...");

    try {
      // Git pull in dev directory
      yield* Effect.logInfo("   📥 Pulling latest changes...");
      const gitResult = yield* shell.exec("git", ["pull"], { cwd: pathService.devDir });

      if (gitResult.exitCode === 0) {
        yield* Effect.logInfo("   ✅ Repository updated");
      } else {
        yield* Effect.logWarning("   ⚠️  Git pull failed, continuing with dependency update");
        yield* Effect.logDebug(`   Git output: ${gitResult.stderr || gitResult.stdout}`);
      }

      // Install/update dependencies
      yield* Effect.logInfo("   📚 Installing dependencies...");
      const bunResult = yield* shell.exec("bun", ["install"], { cwd: pathService.devDir });

      if (bunResult.exitCode === 0) {
        yield* Effect.logInfo("   ✅ Dependencies updated");
      } else {
        yield* Effect.logError(`   ❌ Failed to install dependencies: ${bunResult.stderr}`);
        return yield* Effect.fail(unknownError(`Failed to install dependencies: ${bunResult.stderr}`));
      }
    } catch (error) {
      yield* Effect.logError(`   ❌ Failed to update CLI: ${error}`);
      return yield* Effect.fail(unknownError(`Failed to update CLI: ${error}`));
    }
  });
}

/**
 * Ensure necessary directories exist
 */
function ensureDirectoriesExist(pathService: PathService): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystemService;

    yield* Effect.logInfo("📁 Ensuring directories exist...");

    const directories = [
      { path: pathService.configDir, description: "config directory" },
      { path: pathService.dataDir, description: "data directory" },
      { path: pathService.cacheDir, description: "cache directory" },
    ];

    for (const { path: dirPath, description } of directories) {
      const exists = yield* fileSystem.exists(dirPath);
      if (!exists) {
        yield* fileSystem.mkdir(dirPath, true);
        yield* Effect.logInfo(`   📂 Created ${description}: ${dirPath}`);
      } else {
        yield* Effect.logDebug(`   ✅ ${description} exists: ${dirPath}`);
      }
    }

    yield* Effect.logInfo("   ✅ All directories verified");
  });
}

/**
 * Ensure shell integration is properly configured
 */
function ensureShellIntegration(pathService: PathService): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystemService;

    yield* Effect.logInfo("🐚 Checking shell integration...");

    const zshrcPath = `${pathService.homeDir}/.zshrc`;
    const sourceCommand = "source $HOME/.dev/hack/zshrc.sh";

    // Check if .zshrc exists
    const zshrcExists = yield* fileSystem.exists(zshrcPath);
    if (!zshrcExists) {
      yield* Effect.logWarning("   ⚠️  ~/.zshrc not found - you may need to create it");
      yield* Effect.logInfo(`   💡 To enable dev CLI, add this line to your shell configuration:`);
      yield* Effect.logInfo(`   ${sourceCommand}`);
      return;
    }

    // Check if shell integration is already configured
    const zshrcContent = yield* fileSystem.readFile(zshrcPath);
    if (zshrcContent.includes(sourceCommand)) {
      yield* Effect.logInfo("   ✅ Shell integration already configured");
      return;
    }

    // Add shell integration
    yield* Effect.logInfo("   📝 Adding shell integration to ~/.zshrc...");
    const newContent = zshrcContent + `\n${sourceCommand}\n`;
    yield* fileSystem.writeFile(zshrcPath, newContent);
    yield* Effect.logInfo("   ✅ Shell integration added");
    yield* Effect.logInfo("   💡 Restart your shell or run 'source ~/.zshrc' to activate");
  });
}

/**
 * Update Git plugins in parallel
 */
function updateGitPlugins(gitPlugins: readonly string[]): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🔌 Updating Git plugins...");

    if (gitPlugins.length === 0) {
      yield* Effect.logInfo("   📝 No Git plugins configured");
      return;
    }

    const updateResults = yield* Effect.all(
      gitPlugins.map((pluginUrl) =>
        Effect.either(updateGitPluginEffect(pluginUrl)).pipe(Effect.map((result) => ({ pluginUrl, result }))),
      ),
      { concurrency: 3 }, // Limit concurrency to avoid overwhelming git servers
    );

    for (const { pluginUrl, result } of updateResults) {
      if (result._tag === "Left") {
        yield* Effect.logWarning(`⚠️ Failed to update plugin ${pluginUrl}: ${result.left}`);
      } else {
        yield* Effect.logInfo(`✅ Updated plugin: ${pluginUrl}`);
      }
    }
  });
}

/**
 * Update individual Git plugin
 */
function updateGitPluginEffect(pluginUrl: string): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystemService;
    const git = yield* GitService;
    const pathService = yield* PathServiceTag;

    // Extract plugin name from URL
    const pluginName = pluginUrl.split("/").pop()?.replace(".git", "") || "unknown";
    const pluginDir = `${pathService.cacheDir}/plugins/${pluginName}`;

    // Check if plugin directory exists
    const exists = yield* fileSystem.exists(pluginDir);

    if (exists) {
      // Fetch updates
      yield* git.fetchLatestUpdates(pluginDir);
    } else {
      // Create plugin directory and clone
      yield* fileSystem.mkdir(`${pathService.cacheDir}/plugins`, true);

      // Create a Repository object for cloning
      const repository: Repository = {
        name: pluginName,
        organization: "unknown", // We don't parse org from URL for plugins
        provider: { name: "github", baseUrl: "https://github.com" } as GitProvider,
        cloneUrl: pluginUrl,
      };

      yield* git.cloneRepositoryToPath(repository, pluginDir);
    }
  });
}

/**
 * Upgrade essential tools using their respective services
 */
function upgradeEssentialTools(force: boolean): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("🛠️  Checking and upgrading essential tools...");

    // Tool services
    const bunTools = yield* BunToolsServiceTag;
    const miseTools = yield* MiseToolsServiceTag;
    const gitTools = yield* GitToolsServiceTag;
    const fzfTools = yield* FzfToolsServiceTag;
    const gcloudTools = yield* GcloudToolsServiceTag;

    // Upgrade tools sequentially to avoid conflicts
    yield* Effect.logInfo("   🔧 Checking bun...");
    yield* bunTools.ensureVersionOrUpgrade();

    yield* Effect.logInfo("   🔧 Checking mise...");
    yield* miseTools.ensureVersionOrUpgrade();

    yield* Effect.logInfo("   🔧 Setting up mise global config...");
    yield* miseTools.setupGlobalConfig();

    yield* Effect.logInfo("   🔧 Checking git...");
    yield* gitTools.ensureVersionOrUpgrade();

    yield* Effect.logInfo("   🔧 Checking fzf...");
    yield* fzfTools.ensureVersionOrUpgrade();

    yield* Effect.logInfo("   🔧 Checking gcloud...");
    yield* gcloudTools.ensureVersionOrUpgrade();

    yield* Effect.logInfo("   ✅ All essential tools checked and upgraded");
  });
}

/**
 * Generate shell completions
 */
function generateShellCompletions(): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const shell = yield* ShellService;
    const pathService = yield* PathServiceTag;

    yield* Effect.logInfo("📝 Regenerating shell completions...");

    // This would run the completion generation script
    const result = yield* shell.exec("bun", ["run", "scripts/generate-completions.ts"], {
      cwd: pathService.devDir,
    });

    if (result.exitCode === 0) {
      yield* Effect.logInfo("✅ Shell completions regenerated");
    } else {
      yield* Effect.logWarning("⚠️  Shell completion generation failed");
      yield* Effect.logDebug(`Completion error: ${result.stderr}`);
    }
  });
}

/**
 * Show final success message and usage examples
 */
function showSuccessMessage(): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    yield* Effect.logInfo("");
    yield* Effect.logInfo("🎉 Dev CLI upgrade and setup complete!");
    yield* Effect.logInfo("");
    yield* Effect.logInfo("💡 Usage examples:");
    yield* Effect.logInfo("   dev cd         → Interactive directory navigation");
    yield* Effect.logInfo("   dev cd <name>  → Jump to matching directory");
    yield* Effect.logInfo("   dev up         → Update development tools");
    yield* Effect.logInfo("   dev upgrade    → Update dev CLI itself");
    yield* Effect.logInfo("   dev help       → Show all available commands");
    yield* Effect.logInfo("");
    yield* Effect.logInfo("🚀 Your dev environment is ready!");
    yield* Effect.logInfo("Run 'dev status' to verify your installation");
  });
}
