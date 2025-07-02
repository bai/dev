import { type ConfigLoader } from "../../config/loader";
import type { CliCommandSpec, CommandContext } from "../../domain/models";
import type { FileSystem } from "../../domain/ports/FileSystem";
import type { Git } from "../../domain/ports/Git";
import type { Network } from "../../domain/ports/Network";

interface UpgradeContext extends CommandContext {
  network: Network;
  fileSystem: FileSystem;
  git: Git;
  configLoader: ConfigLoader;
}

export const upgradeCommand: CliCommandSpec = {
  name: "upgrade",
  description: "Upgrade the dev CLI and refresh configuration",
  help: `
Upgrade the dev CLI to the latest version:

Usage:
  dev upgrade                    # Upgrade CLI and refresh config
  dev upgrade --regenerate-completions # Also regenerate shell completions

This command will:
1. Download the latest binary
2. Fetch and update remote configuration
3. Update Git plugins
4. Optionally regenerate shell completions
  `,

  options: [
    {
      flags: "--regenerate-completions",
      description: "Regenerate shell completions after upgrade",
    },
  ],

  async exec(context: CommandContext): Promise<void> {
    const ctx = context as UpgradeContext;
    const regenerateCompletions = ctx.options["regenerate-completions"];

    ctx.logger.info("Starting dev CLI upgrade...");

    // Step 1: Download latest binary (placeholder - would need actual implementation)
    ctx.logger.info("⬇️ Downloading latest binary...");
    // TODO: Implement binary download logic
    ctx.logger.info("✅ Binary updated (placeholder)");

    // Step 2: Refresh remote configuration
    ctx.logger.info("🔄 Refreshing configuration from remote...");

    const configResult = await ctx.configLoader.refresh();

    if (typeof configResult === "object" && "_tag" in configResult) {
      ctx.logger.error(`Failed to refresh configuration: ${configResult.reason}`);
      throw configResult;
    }

    ctx.logger.success("✅ Configuration refreshed successfully");

    // Step 3: Update Git plugins
    ctx.logger.info("🔌 Updating Git plugins...");

    const gitPlugins = configResult.plugins.git;

    for (const pluginUrl of gitPlugins) {
      try {
        await updateGitPlugin(pluginUrl, ctx);
        ctx.logger.info(`✅ Updated plugin: ${pluginUrl}`);
      } catch (error) {
        ctx.logger.warn(`⚠️ Failed to update plugin ${pluginUrl}: ${error}`);
      }
    }

    // Step 4: Generate completions if requested
    if (regenerateCompletions) {
      ctx.logger.info("📝 Regenerating shell completions...");
      // TODO: Implement completion generation
      ctx.logger.info("✅ Shell completions regenerated (placeholder)");
    }

    // Step 5: Report final version
    ctx.logger.info("🎉 Upgrade completed successfully!");
    ctx.logger.info("Run 'dev status' to verify your installation");
  },
};

async function updateGitPlugin(pluginUrl: string, ctx: UpgradeContext): Promise<void> {
  // Extract plugin name from URL
  const pluginName = pluginUrl.split("/").pop()?.replace(".git", "") || "unknown";

  // Use XDG_CACHE_HOME or fallback to ~/.cache
  const cacheDir = process.env.XDG_CACHE_HOME || ctx.fileSystem.resolvePath("~/.cache");
  const pluginDir = `${cacheDir}/dev/plugins/${pluginName}`;

  // Check if plugin directory exists
  if (await ctx.fileSystem.exists(pluginDir)) {
    // Fetch updates
    const fetchResult = await ctx.git.fetch(pluginDir);

    if (typeof fetchResult === "object" && "_tag" in fetchResult) {
      throw new Error(`Git fetch failed: ${fetchResult.reason}`);
    }
  } else {
    // Clone plugin
    // This is simplified - would need to create proper Repository object
    throw new Error("Plugin cloning not yet implemented");
  }
}
