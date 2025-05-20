import { showUsage } from "./utils";
import { handleCdCommand } from "./cmd/cd";
import { handleLsCommand } from "./cmd/ls";
import { handleUpCommand } from "./cmd/up";
import { handleUpgradeCommand } from "./cmd/upgrade";
import { handleCloneCommand } from "./cmd/clone";
import { handleAuthCommand } from "./cmd/auth";
import { spawn } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

// Remove 'bun' and 'index.ts' / or executable name
const args = process.argv.slice(2);

const runPeriodicUpgradeCheck = async () => {
  const DEV_DIR = path.join(os.homedir(), ".dev");
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

  const command = args[0];
  if (command !== "upgrade" && newCount % 10 === 0) {
    console.log(`[dev] Periodic check: Attempting background self-update...`);
    try {
      const child = spawn("bash", [upgradeScriptPath], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      console.log("[dev] Background self-update process completed.");
    } catch (spawnError: any) {
      console.error(
        "[dev] Error starting background self-update process:",
        spawnError.message
      );
    }
  }
};

// Main CLI logic
(async () => {
  await runPeriodicUpgradeCheck();

  if (args.length === 0) {
    showUsage();
  } else if (args[0] === "cd") {
    // Handle cd command with remaining arguments
    if (args.length === 1) {
      // If 'cd' is used without arguments, show the list of directories
      handleLsCommand();
    } else {
      handleCdCommand(args.slice(1));
    }
  } else if (args.length === 1 && args[0] === "ls") {
    handleLsCommand();
  } else if (args.length === 1 && args[0] === "up") {
    // Handle 'dev up' command
    handleUpCommand();
  } else if (args.length === 1 && args[0] === "upgrade") {
    // Handle 'dev upgrade' command
    handleUpgradeCommand();
  } else if (args[0] === "clone") {
    // Handle clone command with remaining arguments
    handleCloneCommand(args.slice(1));
  } else if (args[0] === "auth") {
    // Handle auth command with remaining arguments
    handleAuthCommand(args.slice(1));
  } else {
    showUsage();
  }
})();
