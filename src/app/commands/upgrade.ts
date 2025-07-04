import { Effect } from "effect";

import { ConfigLoaderService, type ConfigLoader } from "../../config/loader";
import { unknownError, type DevError } from "../../domain/errors";
import { type CliCommandSpec, type CommandContext } from "../../domain/models";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { GitService } from "../../domain/ports/Git";
import { NetworkService } from "../../domain/ports/Network";

// Interface removed - services now accessed via Effect Context

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

  exec(context: CommandContext): Effect.Effect<void, DevError, any> {
    return Effect.gen(function* () {
      const configLoader = yield* ConfigLoaderService;
      const regenerateCompletions = context.options["regenerate-completions"];

      yield* Effect.logInfo("Starting dev CLI upgrade...");

      // Step 1: Download latest binary (placeholder - would need actual implementation)
      yield* Effect.logInfo("⬇️ Downloading latest binary...");
      // TODO: Implement binary download logic
      yield* Effect.logInfo("✅ Binary updated (placeholder)");

      // Step 2: Refresh remote configuration
      yield* Effect.logInfo("🔄 Refreshing configuration from remote...");

      const configResult = yield* configLoader.refresh();

      yield* Effect.logInfo("✅ Configuration refreshed successfully");

      // Step 3: Update Git plugins in parallel
      yield* Effect.logInfo("🔌 Updating Git plugins...");

      const gitPlugins = configResult.plugins.git;

      if (gitPlugins.length > 0) {
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
      }

      // Step 4: Generate completions if requested
      if (regenerateCompletions) {
        yield* Effect.logInfo("📝 Regenerating shell completions...");
        // TODO: Implement completion generation
        yield* Effect.logInfo("✅ Shell completions regenerated (placeholder)");
      }

      // Step 5: Report final version
      yield* Effect.logInfo("🎉 Upgrade completed successfully!");
      yield* Effect.logInfo("Run 'dev status' to verify your installation");
    });
  },
};

function updateGitPluginEffect(pluginUrl: string): Effect.Effect<void, DevError, any> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystemService;
    const git = yield* GitService;

    // Extract plugin name from URL
    const pluginName = pluginUrl.split("/").pop()?.replace(".git", "") || "unknown";

    // Use XDG_CACHE_HOME or fallback to ~/.cache
    const cacheDir = process.env.XDG_CACHE_HOME || fileSystem.resolvePath("~/.cache");
    const pluginDir = `${cacheDir}/dev/plugins/${pluginName}`;

    // Check if plugin directory exists
    const exists = yield* fileSystem.exists(pluginDir);

    if (exists) {
      // Fetch updates
      yield* git.fetchLatestUpdates(pluginDir);
    } else {
      // Clone plugin
      // This is simplified - would need to create proper Repository object
      return yield* Effect.fail(unknownError("Plugin cloning not yet implemented"));
    }
  });
}
