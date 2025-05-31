import { baseSearchDir } from "~/lib/constants";
import type { DevCommand } from "~/lib/core/command-types";
import { arg, getArg, spawnCommand } from "~/lib/core/command-utils";
import { findDirs } from "~/lib/find-dirs";
import { handleCdToPath } from "~/lib/handlers";
import { filter } from "~/lib/match";

export const cdCommand: DevCommand = {
  name: "cd",
  description: "Navigate to a directory in ~/src",
  help: `
The cd command helps you quickly navigate to directories:

Interactive Mode:
  dev cd                  # Shows interactive directory picker using fzf

Direct Mode:
  dev cd <folder_name>    # Jump directly to matching directory

Examples:
  dev cd                  # Interactive mode with fuzzy finder
  dev cd myproject        # Direct navigation to myproject directory
  dev cd proj             # Fuzzy match to any directory containing 'proj'
  `,

  arguments: [
    arg("folder_name", "Name of the folder to navigate to", { required: false }),
  ],

  async exec(context) {
    const { logger } = context;
    const folderName = getArg(context, "folder_name");

    try {
      if (folderName) {
        // Direct cd mode
        await handleDirectCd(folderName, logger);
      } else {
        // Interactive cd mode
        await handleInteractiveCd(logger);
      }
    } catch (error: any) {
      logger.error(`CD command failed: ${error.message}`);
      throw error;
    }
  },
};

/**
 * Handles the direct cd command implementation.
 * It looks for directories matching the given name,
 * picks the best matching one using fuzzy matching, and cds into it.
 */
async function handleDirectCd(folderName: string, logger: any): Promise<void> {
  // Basic check to ensure folder name is not empty
  if (!folderName || folderName.trim() === "") {
    throw new Error("Folder name for 'cd' command cannot be empty.");
  }

  const directories = findDirs();

  if (directories.length > 0) {
    const fuzzyMatches = filter(folderName, directories);

    if (fuzzyMatches.length > 0 && fuzzyMatches[0]) {
      const targetPath = fuzzyMatches[0].str; // This is a relative path
      handleCdToPath(targetPath);
      return; // Successfully changed directory
    }
  }

  // Nothing found or no directories
  throw new Error(`Folder '${folderName}' not found in ${baseSearchDir}`);
}

/**
 * Handles interactive cd command implementation.
 * This function uses fzf to interactively select from directories.
 * If a path is selected, it cds into it.
 * The script outputs the selected path to stdout, which is then used by a shell alias/function to `cd`.
 */
async function handleInteractiveCd(logger: any): Promise<void> {
  // Use Bun's glob to find directories
  const directories = findDirs();

  if (directories.length === 0) {
    logger.error(`No directories found in ${baseSearchDir}`);
    return;
  }

  // Create a command that echoes the directories and pipes to fzf
  const directoryList = directories.join("\n");
  const commandString = `echo "${directoryList.replace(/"/g, '\\"')}" | fzf`;

  const proc = spawnCommand(["sh", "-c", commandString]);

  if (proc.stdout) {
    const selectedPath = proc.stdout.toString().trim();
    if (selectedPath) {
      handleCdToPath(selectedPath);
      return; // Path handled, function complete
    }
  }

  // Handle fzf exit codes for cancellation or no selection
  // Exit codes 1 (no match) and 130 (cancelled by SIGINT/Ctrl+C) are considered normal non-selection cases.
  if (proc.exitCode !== 0 && proc.exitCode !== 1 && proc.exitCode !== 130) {
    // For other non-zero exit codes, it's an unexpected error from fzf or the shell.
    throw new Error(`Error during fzf execution. Exit code: ${proc.exitCode}`);
  }

  // If no path was selected (e.g., fzf cancelled or no output), we simply do nothing.
  // The shell wrapper won't receive a "CD:" line and won't change directory.
}
