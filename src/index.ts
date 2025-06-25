import path from "path";

import { Command } from "commander";

import { createCommandLoader, loadAllCommands } from "~/lib/core/command-loader";
import { autoDiscoverCommands, commandRegistry } from "~/lib/core/command-registry";
import { createConfig } from "~/lib/dev-config";
import { ensureBaseDirectoryExists } from "~/lib/ensure-base-directory-exists";
import { ensureDatabaseIsUpToDate } from "~/lib/ensure-database-is-up-to-date";
import { isDebugMode } from "~/lib/is-debug-mode";
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

    // Show help when no command is provided
    if (process.argv.slice(2).length === 0) {
      process.argv.push("help");
    }

    // Initialize services
    const config = createConfig();
    const loader = createCommandLoader(logger, config);

    // Set up commander program
    const program = new Command();
    program
      .name("dev")
      .description("A CLI tool for quick directory navigation and environment management")
      .version(getCurrentGitCommitSha());

    // Auto-discover and register commands from src/commands
    await autoDiscoverCommands(path.join(__dirname, "commands"));

    // Load all registered commands into commander
    const allCommands = commandRegistry.getAll();
    loadAllCommands(allCommands, program, logger, config);

    // Parse command line arguments
    await program.parseAsync(process.argv);
  } catch (error: any) {
    logger.error(`❌ Unexpected error: ${error.message}`);
    if (isDebugMode()) {
      logger.error(error.stack);
    }
    process.exit(1);
  }
})();

// Export the functional system for external use
export { commandRegistry, createCommandRegistry } from "~/lib/core/command-registry";
export { createCommandLoader, loadCommand, loadAllCommands } from "~/lib/core/command-loader";

export { createConfig, configManager } from "~/lib/dev-config";
export * from "~/lib/core/command-types";
export * from "~/lib/core/command-utils";
