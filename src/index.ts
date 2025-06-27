import path from "path";

import { Command } from "commander";

import { loadAllCommands } from "~/lib/core/command-loader";
import { autoDiscoverCommands, commandRegistry } from "~/lib/core/command-registry";
import { createConfig } from "~/lib/dev-config";
import { ensureBaseDirectoryExists } from "~/lib/ensure-base-directory-exists";
import { ensureDatabaseIsUpToDate } from "~/lib/ensure-database-is-up-to-date";
import { handleFatal } from "~/lib/handle-error";
import { isDebugMode } from "~/lib/is-debug-mode";
import { logger } from "~/lib/logger";
import { recordCommandRun } from "~/lib/record-command-run";
import { runPeriodicUpgradeCheck } from "~/lib/run-update-check";
import { ensureMiseVersionOrUpgrade } from "~/lib/tools/mise";
import { getCurrentGitCommitSha } from "~/lib/version";

async function main() {
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

  // Set up commander program
  const program = new Command();
  program
    .name("dev")
    .description("A CLI tool for quick directory navigation and environment management")
    .version(getCurrentGitCommitSha())
    .exitOverride(); // Convert Commander failures into typed errors

  // Auto-discover and register commands from src/commands
  await autoDiscoverCommands(path.join(__dirname, "commands"));

  // Load all registered commands into commander
  const allCommands = commandRegistry.getAll();
  loadAllCommands(allCommands, program, logger, config);

  // Parse command line arguments
  await program.parseAsync(process.argv);
}

// Single exit point as specified in error-handling strategy
main().catch((err) => handleFatal(err, logger));
