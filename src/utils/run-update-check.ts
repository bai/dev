import { spawn } from "child_process";
import path from "path";
import { Database } from "bun:sqlite";
import { devDir } from "~/utils/constants";

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
