import { logger } from "~/lib/logger";
import { getCurrentGitCommitSha } from "~/lib/version";
import { db } from "~/drizzle";
import { runs } from "~/drizzle/schema";

/**
 * Records the current CLI run in the database.
 *
 * This function records each CLI run individually in the database with details like
 * command name, arguments, CLI version, cwd, and timestamps. The exit_code and finished_at
 * fields will be set to null initially and should be updated when the command completes.
 *
 * @returns Promise<void> Resolves when the recording is complete
 */
export const recordCommandRun = async (): Promise<void> => {
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
};
