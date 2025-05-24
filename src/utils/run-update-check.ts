import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { homeDir } from "~/utils/constants";

export const runPeriodicUpgradeCheck = async () => {
  const DEV_DIR = path.join(homeDir, ".dev");
  const runCountFilePath = path.join(DEV_DIR, ".dev_run_count");
  const upgradeScriptPath = path.join(DEV_DIR, "hack", "setup.sh");

  let currentCount = 0;
  try {
    const countData = await fs.readFile(runCountFilePath, "utf-8");
    currentCount = parseInt(countData, 10);
    if (isNaN(currentCount)) {
      currentCount = 0;
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      console.warn("Warning: Could not read run count file:", error.message);
    }
    currentCount = 0; // Initialize if file not found or other error
  }

  const newCount = currentCount + 1;

  try {
    await fs.writeFile(runCountFilePath, newCount.toString(), "utf-8");
  } catch (error: any) {
    console.warn("Warning: Could not write run count file:", error.message);
    // Proceed even if we can't write the count, to not break main functionality
  }

  // Get the command from commander args instead of process.argv
  const commandName = process.argv[2];
  if (commandName !== "upgrade" && newCount % 10 === 0) {
    console.log(`[dev] Periodic check: Attempting background self-update...`);
    try {
      const child = spawn("bash", [upgradeScriptPath], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      console.log("[dev] Background self-update process completed.");
    } catch (spawnError: any) {
      console.error("[dev] Error starting background self-update process:", spawnError.message);
    }
  }
};
