import fs from "fs";
import path from "path";

import { devConfigDir, devDataDir, devDir, homeDir } from "~/lib/constants";
import type { DevCommand } from "~/lib/core/command-types";
import { runCommand, spawnCommand } from "~/lib/core/command-utils";
import { refreshDevConfigFromRemoteUrl } from "~/lib/dev-config";
import { ensureDatabaseIsUpToDate } from "~/lib/ensure-database-is-up-to-date";
import { setupGoogleCloudConfig } from "~/lib/tools/gcloud";
import { ensureMiseVersionOrUpgrade, setupMiseGlobalConfig } from "~/lib/tools/mise";

/**
 * Self-updates the dev CLI by pulling latest changes and installing dependencies
 */
async function updateCliRepository(context: any): Promise<void> {
  const { logger } = context;

  logger.info("📦 Updating dev CLI repository...");

  try {
    // Change to the dev directory and pull latest changes
    const gitPullResult = spawnCommand(["git", "pull"], { cwd: devDir, silent: true });

    if (gitPullResult.exitCode === 0) {
      logger.info("   ✅ Repository updated");
    } else {
      logger.warn("   ⚠️  Git pull failed, continuing with dependency update");
      logger.debug(`   Git output: ${gitPullResult.stderr || gitPullResult.stdout}`);
    }

    // Install/update dependencies
    logger.info("   📚 Installing dependencies...");
    runCommand(["bun", "install"], context, { cwd: devDir, silent: true });
    logger.info("   ✅ Dependencies updated");
  } catch (error: any) {
    logger.error(`   ❌ Failed to update CLI: ${error.message}`);
    throw error;
  }
}

/**
 * Ensures all necessary directories exist
 */
async function ensureDirectoriesExist(context: any): Promise<void> {
  const { logger } = context;

  logger.info("📁 Ensuring directories exist...");

  const directories = [
    { path: devConfigDir, description: "config directory" },
    { path: devDataDir, description: "data directory" },
  ];

  for (const { path: dirPath, description } of directories) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.info(`   📂 Created ${description}: ${dirPath}`);
      } else {
        logger.debug(`   ✅ ${description} exists: ${dirPath}`);
      }
    } catch (error: any) {
      logger.error(`   ❌ Failed to create ${description}: ${error.message}`);
      throw error;
    }
  }

  logger.info("   ✅ All directories verified");
}

/**
 * Ensures shell integration is properly configured
 */
async function ensureShellIntegration(context: any): Promise<void> {
  const { logger } = context;

  logger.info("🐚 Checking shell integration...");

  const zshrcPath = path.join(homeDir, ".zshrc");
  const sourceCommand = "source $HOME/.dev/hack/zshrc.sh";

  try {
    // Check if .zshrc exists
    if (!fs.existsSync(zshrcPath)) {
      logger.warn("   ⚠️  ~/.zshrc not found - you may need to create it");
      logger.info(`   💡 To enable dev CLI, add this line to your shell configuration:`);
      logger.info(`   ${sourceCommand}`);
      return;
    }

    // Check if shell integration is already configured
    const zshrcContent = fs.readFileSync(zshrcPath, "utf-8");
    if (zshrcContent.includes(sourceCommand)) {
      logger.info("   ✅ Shell integration already configured");
      return;
    }

    // Add shell integration
    logger.info("   📝 Adding shell integration to ~/.zshrc...");
    fs.appendFileSync(zshrcPath, `\n${sourceCommand}\n`);
    logger.info("   ✅ Shell integration added");
    logger.info("   💡 Restart your shell or run 'source ~/.zshrc' to activate");
  } catch (error: any) {
    logger.error(`   ❌ Failed to configure shell integration: ${error.message}`);
    throw error;
  }
}

/**
 * Ensures essential tools are available via mise
 */
async function ensureEssentialTools(context: any): Promise<void> {
  const { logger } = context;

  logger.info("🛠️  Checking essential tools...");

  const essentialTools = ["fzf", "git"];

  for (const tool of essentialTools) {
    const result = spawnCommand(["which", tool], { silent: true });
    if (result.exitCode !== 0) {
      logger.info(`   📦 ${tool} not found, will be installed via mise`);
    } else {
      logger.debug(`   ✅ ${tool} available at: ${result.stdout?.trim()}`);
    }
  }

  logger.info("   ✅ Essential tools check complete");
  logger.info("   💡 If tools are missing, they should be available after mise configuration");
}

export const upgradeCommand: DevCommand = {
  name: "upgrade",
  description: "Updates the dev CLI tool itself",
  help: `
The upgrade command updates your dev CLI tool itself:

- Self-updates the CLI: git pull and bun install in ~/.dev
- Ensures necessary directories exist (~/.config/dev, ~/.local/share/dev)
- Updates shell integration if needed (adds source line to ~/.zshrc)
- Refreshes dev configuration from remote source
- Sets up Google Cloud configuration
- Configures mise global settings
- Ensures database is up to date
- Checks mise version and upgrades if needed
- Ensures essential tools are available
- Provides usage examples

Examples:
  dev upgrade             # Upgrade to latest version
  `,

  async exec(context) {
    const { logger } = context;

    try {
      logger.info("🔄 Upgrading dev CLI tool...");

      // Step 1: Self-update the CLI repository and dependencies
      await updateCliRepository(context);

      // Step 2: Ensure necessary directories exist
      await ensureDirectoriesExist(context);

      // Step 3: Ensure shell integration is configured
      await ensureShellIntegration(context);

      // Step 4: Refresh dev config from remote URL
      await refreshDevConfigFromRemoteUrl();

      // Step 5: Google Cloud Config
      await setupGoogleCloudConfig();

      // Step 6: Mise Configuration
      await setupMiseGlobalConfig();

      // Step 7: Database migrations (ensure DB is up to date)
      await ensureDatabaseIsUpToDate();

      // Step 8: Mise version check and upgrade if needed
      await ensureMiseVersionOrUpgrade();

      // Step 9: Check essential tools
      await ensureEssentialTools(context);

      logger.info("");
      logger.success("🎉 Dev CLI upgrade and setup complete!");
      logger.info("");
      logger.info("💡 Usage examples:");
      logger.info("   dev cd         → Interactive directory navigation");
      logger.info("   dev cd <name>  → Jump to matching directory");
      logger.info("   dev up         → Update development tools");
      logger.info("   dev upgrade    → Update dev CLI itself");
      logger.info("   dev help       → Show all available commands");
      logger.info("");
      logger.info("🚀 Your dev environment is ready!");
    } catch (error: any) {
      logger.error(`Upgrade failed: ${error.message}`);
      throw error;
    }
  },
};
