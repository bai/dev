import { desc, eq } from "drizzle-orm";

import { logger } from "~/lib/logger";

import { db } from "../../drizzle";
import { runs } from "../../drizzle/schema";

const upgradeFrequency = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

/**
 * Checks if an upgrade prompt is needed and displays it when appropriate.
 *
 * This function checks if the last recorded run of the "upgrade" command was more than 7 days ago,
 * and if so, it prompts the user to run `dev upgrade` manually.
 *
 * @returns Promise<void> Resolves when the check is complete
 */
export const runPeriodicUpgradeCheck = async (): Promise<void> => {
  const commandName = process.argv[2] || "help";

  // Check if we should prompt for an update (only if not running upgrade command)
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
        logger.warn("🔄 [dev] It's been more than 7 days since your last upgrade.");
        logger.info("💡 [dev] Run 'dev upgrade' to update your CLI tool and development environment.");
        logger.info("");
      }
    } catch (error: any) {
      logger.warn("⚠️  Warning: Could not check last run timestamp:", error.message);
      // Proceed even if we can't check the timestamp, to not break main functionality
    }
  }
};
