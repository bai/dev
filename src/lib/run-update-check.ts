import { spawn } from "child_process";
import path from "path";

import { Database } from "bun:sqlite";

import { devDir } from "~/lib/constants";

/**
 * Initializes the SQLite database for tracking run counts.
 *
 * Creates the database file if it doesn't exist and sets up the run_count table.
 * Inserts an initial record with count 0 if the table is empty.
 *
 * @param dbPath - The file path where the SQLite database should be created/opened
 * @returns Database instance ready for use
 */
const initializeDatabase = (dbPath: string): Database => {
  const db = new Database(dbPath, { create: true, strict: true });

  // Create the run_count table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS run_count (
      id INTEGER PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert initial record if table is empty
  const countRow = db.query("SELECT count FROM run_count WHERE id = 1").get() as { count: number } | null;
  if (!countRow) {
    db.query("INSERT INTO run_count (id, count) VALUES (1, 0)").run();
  }

  return db;
};

/**
 * Runs a periodic upgrade check and triggers background self-update when appropriate.
 *
 * This function tracks how many times the dev CLI has been run using a SQLite database.
 * Every 10th run (excluding the "upgrade" command itself), it spawns a detached background
 * process to run the self-update script. The update process runs independently and won't
 * block or interfere with the current command execution.
 *
 * The function gracefully handles database errors and will continue execution even if
 * the run count cannot be read or updated, ensuring the main CLI functionality is not
 * disrupted by tracking issues.
 *
 * @returns Promise<void> Resolves when the check is complete
 */
export const runPeriodicUpgradeCheck = async () => {
  const databasePath = path.join(devDir, "db.sqlite");
  const upgradeScriptPath = path.join(devDir, "hack", "setup.sh");

  let currentCount = 0;
  let db: Database | null = null;

  try {
    db = initializeDatabase(databasePath);
    const countRow = db.query("SELECT count FROM run_count WHERE id = 1").get() as { count: number } | null;
    currentCount = countRow?.count ?? 0;
  } catch (error: any) {
    console.warn("⚠️  Warning: Could not read run count from database:", error.message);
    currentCount = 0;
  }

  const newCount = currentCount + 1;

  try {
    if (db) {
      db.query("UPDATE run_count SET count = ?, last_updated = CURRENT_TIMESTAMP WHERE id = 1").run(newCount);
    }
  } catch (error: any) {
    console.warn("⚠️  Warning: Could not update run count in database:", error.message);
    // Proceed even if we can't write the count, to not break main functionality
  } finally {
    // Clean up database connection
    if (db) {
      db.close();
    }
  }

  // Get the command from commander args instead of process.argv
  const commandName = process.argv[2];
  if (commandName !== "upgrade" && newCount % 10 === 0) {
    console.log(`🔄 [dev] Periodic check: Attempting background self-update...`);
    try {
      const child = spawn("bash", [upgradeScriptPath], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      console.log("✅ [dev] Background self-update process completed.");
    } catch (spawnError: any) {
      console.error("❌ [dev] Error starting background self-update process:", spawnError.message);
    }
  }
};
