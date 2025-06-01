import path from "path";

import { Command } from "commander";

import { CommandLoader } from "~/lib/core/command-loader";
import { CommandRegistry } from "~/lib/core/command-registry";
import { createConfig } from "~/lib/dev-config";
import { ensureBaseDirectoryExists } from "~/lib/ensure-base-directory-exists";
import { ensureDatabaseIsUpToDate } from "~/lib/ensure-database-is-up-to-date";
import { logger } from "~/lib/logger";
import { recordCommandRun } from "~/lib/record-command-run";
import { runPeriodicUpgradeCheck } from "~/lib/run-update-check";
import { ensureMiseVersionOrUpgrade } from "~/lib/tools/mise";
import { getCurrentGitCommitSha } from "~/lib/version";

(async () => {
  try {
    await ensureBaseDirectoryExists();
    await ensureDatabaseIsUpToDate();
    await recordCommandRun();
    await runPeriodicUpgradeCheck();
    await ensureMiseVersionOrUpgrade();

    // Check for help commands before commander processes them
    const args = process.argv.slice(2);
    if (args.length === 0) {
      // Show help when no command is provided
      process.argv.push("help");
    }

    // Initialize services
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
    // Use the imported logger for error handling
    logger.error(`❌ Unexpected error: ${error.message}`);
    if (process.env.DEBUG) {
      logger.error(error.stack);
    }
    process.exit(1);
  }
})();

// Export the system for external use
export { CommandRegistry } from "~/lib/core/command-registry";
export { CommandLoader } from "~/lib/core/command-loader";

export { createConfig } from "~/lib/dev-config";
export * from "~/lib/core/command-types";
export * from "~/lib/core/command-utils";
