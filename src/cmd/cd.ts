import { spawnSync } from "bun";

import { baseSearchDir } from "~/lib/constants";
import { findDirs } from "~/lib/find-dirs";
import { handleCdToPath, handleCommandError } from "~/lib/handlers";
import { filter } from "~/lib/match";

/**
 * Handles the direct cd command implementation.
 * It looks for directories matching the given name,
 * picks the best matching one using fuzzy matching, and cds into it.
 *
 * @param folderName The folder name to search for and cd into
 */
export function handleDirectCd(folderName: string): void {
  // Basic check to ensure folder name is not empty
  if (!folderName || folderName.trim() === "") {
    console.error("❌ Error: Folder name for 'cd' command cannot be empty.");
    process.exit(1);
  }

  try {
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
    console.error(`❌ Folder '${folderName}' not found in ${baseSearchDir}`);
    process.exit(1);
  } catch (error: any) {
    // handleCommandError is expected to log the error and exit.
    // If it's configured not to exit, we ensure exit here.
    handleCommandError(error, `find folder '${folderName}'`, "Bun glob");
  }
}

/**
 * Handles interactive cd command implementation.
 * This function uses fzf to interactively select from directories.
 * If a path is selected, it cds into it.
 * The script outputs the selected path to stdout, which is then used by a shell alias/function to `cd`.
 */
export function handleInteractiveCd(): void {
  try {
    // Use Bun's glob to find directories
    const directories = findDirs();

    if (directories.length === 0) {
      console.error(`❌ No directories found in ${baseSearchDir}`);
      // If no directories, we don't call fzf and effectively do nothing
      return;
    }

    // Create a command that echoes the directories and pipes to fzf
    const directoryList = directories.join("\n");
    const commandString = `echo "${directoryList.replace(/"/g, '\\"')}" | fzf`;
    const proc = spawnSync(["sh", "-c", commandString], {
      stdio: ["ignore", "pipe", "inherit"],
    });

    if (proc.stdout) {
      const selectedPath = proc.stdout.toString().trim();
      if (selectedPath) {
        handleCdToPath(selectedPath);
        return; // Path handled, function complete
      }
    }

    // Handle fzf exit codes for cancellation or no selection
    // Exit codes 1 (no match) and 130 (cancelled by SIGINT/Ctrl+C) are considered normal non-selection cases.
    // In these cases, we do nothing, and the shell wrapper won't receive a "CD:" line.
    if (proc.exitCode !== 0 && proc.exitCode !== 1 && proc.exitCode !== 130) {
      // For other non-zero exit codes, it's an unexpected error from fzf or the shell.
      console.error(`Error during fzf execution. Exit code: ${proc.exitCode}`);
      process.exit(proc.exitCode || 1);
    }

    // If no path was selected (e.g., fzf cancelled or no output), we simply do nothing.
    // The shell wrapper won't receive a "CD:" line and won't change directory.
  } catch (error: any) {
    // Handles errors from findDirs or spawnSync
    handleCommandError(error, "interactive cd mode", "Bun glob or fzf");
  }
}
