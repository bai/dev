import { Command } from "commander";
import { desc, eq } from "drizzle-orm";

import { createConfig } from "~/lib/dev-config";
import { logger } from "~/lib/logger";
import { getCurrentGitCommitSha } from "~/lib/version";
import { upgradeCommand } from "~/commands/upgrade";
import { db } from "~/drizzle";
import { runs } from "~/drizzle/schema";

// const upgradeFrequency = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const upgradeFrequency = 1 * 60 * 1000; // 1 minute in milliseconds

/**
 * Records the current CLI run and triggers background self-update when appropriate.
 *
 * This function records each CLI run individually in the database with details like
 * command name, arguments, CLI version, and timestamps. It checks if the last recorded
 * run of the "upgrade" command was more than 7 days ago, and if so,
 * it executes the upgrade command directly via TypeScript.
 *
 * @returns Promise<void> Resolves when the check is complete
 */
export const runPeriodicUpgradeCheck = async () => {
  // Gather run information
  const commandName = process.argv[2] || "help";
  const args = process.argv.slice(3);
  const cliVersion = getCurrentGitCommitSha();
  const cwd = process.cwd();
  const startedAt = new Date();

  // Record this run
  try {
    await db.insert(runs).values({
      id: Bun.randomUUIDv7(),
      cli_version: cliVersion,
      command_name: commandName,
      arguments: args.length > 0 ? JSON.stringify(args) : null,
      exit_code: null, // Will be set when the command completes
      cwd: cwd,
      started_at: startedAt,
      finished_at: null, // Will be set when the command completes
    });
  } catch (error: any) {
    logger.warn("⚠️  Warning: Could not record run in database:", error.message);
    // Proceed even if we can't record the run, to not break main functionality
  }

  // Check if we should run an update (only if not running upgrade command)
  if (commandName !== "upgrade") {
    try {
      // Get the most recent run of the "upgrade" command
      const lastRun = await db
        .select()
        .from(runs)
        .where(eq(runs.command_name, "upgrade"))
        .orderBy(desc(runs.started_at))
        .limit(1);

      const shouldUpdate =
        !lastRun.length ||
        (lastRun[0] && new Date().getTime() - new Date(lastRun[0].started_at).getTime() > upgradeFrequency);

      if (shouldUpdate) {
        logger.info(`🔄 [dev] Periodic check: Last update was more than 7 days ago. Running background self-update...`);
        try {
          // Create a proper context for the upgrade command
          const upgradeContext = {
            args: {},
            options: {},
            command: new Command("upgrade"), // Create a minimal command instance
            logger,
            config: createConfig(),
          };

          // Execute the upgrade command directly
          await upgradeCommand.exec(upgradeContext);
          logger.info("✅ [dev] Background self-update completed successfully.");
        } catch (upgradeError: any) {
          logger.error("❌ [dev] Error during background self-update:", upgradeError.message);
        }

        // Add a new run for the upgrade command
        await db.insert(runs).values({
          id: Bun.randomUUIDv7(),
          cli_version: cliVersion,
          command_name: "upgrade",
          arguments: null,
          exit_code: null,
          cwd: cwd,
          started_at: new Date(),
          finished_at: null,
        });
      }
    } catch (error: any) {
      logger.warn("⚠️  Warning: Could not check last run timestamp:", error.message);
      // Proceed even if we can't check the timestamp, to not break main functionality
    }
  }
};
