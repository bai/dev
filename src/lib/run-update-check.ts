import { spawn } from "child_process";
import path from "path";

import { desc } from "drizzle-orm";

import { devDir } from "~/lib/constants";
import { getCurrentGitCommitSha } from "~/lib/version";
import { db } from "~/drizzle";
import { runs } from "~/drizzle/schema";

/**
 * Records the current CLI run and triggers background self-update when appropriate.
 *
 * This function records each CLI run individually in the database with details like
 * command name, arguments, CLI version, and timestamps. It checks if the last recorded
 * run was more than 7 days ago, and if so (excluding the "upgrade" command itself),
 * it spawns a detached background process to run the self-update script.
 *
 * The function gracefully handles database errors and will continue execution even if
 * the run cannot be recorded, ensuring the main CLI functionality is not disrupted
 * by tracking issues.
 *
 * @returns Promise<void> Resolves when the check is complete
 */
export const runPeriodicUpgradeCheck = async () => {
  const upgradeScriptPath = path.join(devDir, "hack", "setup.sh");

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
      flags: null, // Could be enhanced to parse flags separately
      exit_code: null, // Will be set when the command completes
      cwd: cwd,
      started_at: startedAt,
      finished_at: null, // Will be set when the command completes
    });
  } catch (error: any) {
    console.warn("⚠️  Warning: Could not record run in database:", error.message);
    // Proceed even if we can't record the run, to not break main functionality
  }

  // Check if we should run an update (only if not running upgrade command)
  if (commandName !== "upgrade") {
    try {
      // Get the most recent run (excluding the current one we just inserted)
      const lastRun = await db
        .select()
        .from(runs)
        .orderBy(desc(runs.created_at))
        .limit(2) // Get 2 to skip the one we just inserted
        .offset(1); // Skip the first one (current run)

      const shouldUpdate =
        !lastRun.length ||
        (lastRun[0] && new Date().getTime() - new Date(lastRun[0].created_at).getTime() > 7 * 24 * 60 * 60 * 1000);

      if (shouldUpdate) {
        console.log(
          `🔄 [dev] Periodic check: Last update was more than 7 days ago. Attempting background self-update...`,
        );
        try {
          const child = spawn("bash", [upgradeScriptPath], {
            detached: true,
            stdio: "ignore",
          });
          child.unref();
          console.log("✅ [dev] Background self-update process started.");
        } catch (spawnError: any) {
          console.error("❌ [dev] Error starting background self-update process:", spawnError.message);
        }
      }
    } catch (error: any) {
      console.warn("⚠️  Warning: Could not check last run timestamp:", error.message);
      // Proceed even if we can't check the timestamp, to not break main functionality
    }
  }
};
