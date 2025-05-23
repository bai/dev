import { showUsage, validateBaseSearchDir } from "./utils";
import { handleCdCommand } from "./cmd/cd";
import { handleLsCommand } from "./cmd/ls";
import { handleUpCommand } from "./cmd/up";
import { handleUpgradeCommand } from "./cmd/upgrade";
import { handleCloneCommand } from "./cmd/clone";
import { handleAuthCommand } from "./cmd/auth";
import { handleStatusCommand } from "./cmd/status";
import { handleOpenCommand } from "./cmd/open";
import { handleTestCommand } from "./cmd/test";
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

// Valid commands for better validation
const VALID_COMMANDS = [
  "cd",
  "ls",
  "up",
  "upgrade",
  "clone",
  "auth",
  "status",
  "open",
  "test",
  "help",
  "--help",
  "-h",
] as const;
type ValidCommand = (typeof VALID_COMMANDS)[number];

function isValidCommand(cmd: string): cmd is ValidCommand {
  return VALID_COMMANDS.includes(cmd as ValidCommand);
}

function validateCommand(cmd: string): void {
  if (!isValidCommand(cmd)) {
    console.error(`❌ Error: Unknown command '${cmd}'`);
    console.error(
      `\n📖 Valid commands: ${VALID_COMMANDS.filter(
        (c) => !c.startsWith("-")
      ).join(", ")}`
    );
    console.error(`\n💡 Run 'dev help' for usage information.`);
    process.exit(1);
  }
}

// Main CLI logic
(async () => {
  try {
    await runPeriodicUpgradeCheck();

    // Validate base search directory exists
    validateBaseSearchDir();

    if (args.length === 0) {
      showUsage();
    }

    const command = args[0];
    if (!command) {
      showUsage();
    }

    // Handle help commands
    if (command === "help" || command === "--help" || command === "-h") {
      showUsage();
    }

    // Validate command before processing
    validateCommand(command);

    // Route to appropriate command handler
    switch (command) {
      case "cd":
        if (args.length === 1) {
          // If 'cd' is used without arguments, show the list of directories
          handleLsCommand();
        } else {
          handleCdCommand(args.slice(1));
        }
        break;

      case "ls":
        handleLsCommand();
        break;

      case "up":
        handleUpCommand();
        break;

      case "upgrade":
        handleUpgradeCommand();
        break;

      case "clone":
        handleCloneCommand(args.slice(1));
        break;

      case "auth":
        await handleAuthCommand(args.slice(1));
        break;

      case "status":
        handleStatusCommand();
        break;

      case "open":
        handleOpenCommand(args.slice(1));
        break;

      case "test":
        handleTestCommand();
        break;

      default:
        // This should never happen due to validation, but just in case
        console.error(`❌ Error: Unhandled command '${command}'`);
        showUsage();
    }
  } catch (error: any) {
    console.error(`❌ Unexpected error: ${error.message}`);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
