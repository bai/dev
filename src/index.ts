import fs from "fs";
import path from "path";

import { Command } from "commander";

import { baseSearchDir } from "~/lib/constants";
import { ensureMiseVersionOrUpgrade } from "~/lib/mise-version";
import { runPeriodicUpgradeCheck } from "~/lib/run-update-check";
import { ensureDatabaseIsUpToDate } from "~/lib/setup";
import { getCurrentGitCommitSha } from "~/lib/version";
import { CommandLoader } from "~/core/command-loader";
import { CommandRegistry } from "~/core/command-registry";
import { createConfig } from "~/services/config";
import { createLogger } from "~/services/logger";

(async () => {
  try {
    await ensureDatabaseIsUpToDate();
    await runPeriodicUpgradeCheck();
    await ensureMiseVersionOrUpgrade("run");

    // Ensure base search directory exists
    if (!fs.existsSync(baseSearchDir)) {
      try {
        fs.mkdirSync(baseSearchDir, { recursive: true });
        console.log(`📁 Created base search directory: ${baseSearchDir}`);
      } catch (error: any) {
        console.error(`❌ Error: Failed to create base search directory: ${baseSearchDir}`);
        console.error(`   ${error.message}`);
        if (error.code === "EACCES") {
          console.error("💡 Permission denied. Run `dev status` to check environment health.");
        } else if (error.code === "ENOSPC") {
          console.error("💡 No space left on device. Free up some disk space and try again.");
        }
        process.exit(1);
      }
    }

    // Check for help commands before commander processes them
    const args = process.argv.slice(2);
    if (args.length === 0) {
      // Show help when no command is provided
      process.argv.push("help");
    }

    // Initialize services
    const logger = createLogger(process.env.DEBUG === "true");
    const config = createConfig();
    const registry = new CommandRegistry();
    const loader = new CommandLoader(registry, logger, config);

    // Set up commander program
    const program = new Command();
    program
      .name("dev")
      .description("A CLI tool for quick directory navigation and environment management")
      .version(getCurrentGitCommitSha());

    // Auto-discover and register commands from src/commands
    const cmdDir = path.join(__dirname, "commands");
    await registry.autoDiscoverCommands(cmdDir);

    // Load all registered commands into commander
    loader.loadAllCommands(program);

    // Log statistics if debug mode
    if (process.env.DEBUG) {
      const stats = registry.getStats();
      logger.debug(`Command registry stats: ${JSON.stringify(stats, null, 2)}`);
    }

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error: any) {
    console.error(`❌ Unexpected error: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();

// Export the system for external use
export { CommandRegistry } from "~/core/command-registry";
export { CommandLoader } from "~/core/command-loader";
export { createLogger } from "~/services/logger";
export { createConfig } from "~/services/config";
export * from "~/types/command";
export * from "~/utils/command-utils";
