import os from "os";
import path from "path";

// Common variables
export const homeDir = os.homedir();
export const baseSearchDir = path.join(homeDir, "src");

// Common utility to handle errors from subprocesses
export function handleCommandError(
  error: any,
  commandName: string,
  requiredCommands: string
): never {
  if (error.code === "ENOENT") {
    console.error(
      `Error: A required command (${requiredCommands}) could not be found. Please ensure they are installed and in your PATH.`
    );
  } else {
    console.error(`Failed to execute ${commandName}: ${error.message}`);
  }
  process.exit(1);
}

// Handles changing directory through shell wrapper
export function handleCdToPath(targetPath: string): void {
  // Special format for the shell wrapper to interpret: "CD:<path>"
  console.log(`CD:${targetPath}`);
  process.exit(0);
}

// Shows usage information
export function showUsage(): never {
  console.error(`dev: A CLI tool for quick directory navigation and environment management.

Usage:
  dev cd                     Interactively select a directory from ~/src using fzf.
                             (Searches for directories at depth 3 in ~/src)

  dev cd <folder_name>       Finds and outputs the path to <folder_name> within ~/src.
                             (Searches for a directory named <folder_name> at depth 3)

  dev up                     Runs 'mise up' to update development tools.

  dev upgrade                Updates the dev CLI tool to the latest version.
`);
  process.exit(1);
}
