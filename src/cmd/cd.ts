import { spawnSync } from "bun";

import { baseSearchDir, stdioPipe } from "~/lib/constants";
import { handleCdToPath, handleCommandError } from "~/lib/handlers";

/**
 * Handles the cd command implementation.
 *
 * @param args Command arguments (excluding the 'cd' part)
 */
export function handleCdCommand(args: string[]): void {
  if (args.length === 0) {
    console.error("❌ Error: Missing folder name for 'cd' command. Usage: dev cd <folder_name>");
    process.exit(1);
  } else if (args.length === 1) {
    const folderName = args[0];
    // Basic check, though process.argv usually provides non-empty strings for args.
    if (!folderName || folderName.trim() === "") {
      console.error("❌ Error: Folder name for 'cd' command cannot be empty.");
      process.exit(1);
    }
    const targetPath = handleDirectCdMode(folderName);
    if (targetPath) {
      handleCdToPath(targetPath);
    }
  } else {
    console.error("❌ Error: Too many arguments for 'cd' command.");
    process.exit(1);
  }
}

/**
 * Handles the direct cd mode, e.g., `dev cd dev`.
 * It looks for directories matching the given name at the third level in ~/src and
 * picks the best matching one to cd into using fuzzy matching.
 *
 * @param folderName The folder name to search for
 * @returns The matched path or null if no match found
 */
function handleDirectCdMode(folderName: string): string | null {
  // Use fzy in non-interactive mode to perform fuzzy matching
  // This will find the best match for the given folder name at the third level
  const commandString = `fd --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --exclude .terraform --exclude .terragrunt-cache --color=never . "${baseSearchDir}" | sed 's/\\/*$//g' | fzy -e "${folderName}" | head -n 1`;

  try {
    const proc = spawnSync(["sh", "-c", commandString], {
      stdio: stdioPipe, // stdin: ignore, stdout: capture, stderr: capture.
    });

    if (proc.stdout) {
      const foundPath = proc.stdout.toString().trim();
      if (foundPath) {
        return foundPath; // Return found path.
      }
    }

    // Nothing found
    console.error(`❌ Folder '${folderName}' not found in ${baseSearchDir}`);
    process.exit(1);
  } catch (error: any) {
    return handleCommandError(error, `find folder '${folderName}'`, "sh, fd, fzy, or head");
  }
}

/**
 * Handles the interactive fzf mode when `dev cd` is called.
 * This function uses fzf to interactively select from directories at the third level in ~/src.
 * (e.g., ~/src/github.com/bai/dev, where "dev" is at the third level)
 * The script outputs the selected path to stdout, which is then used by a shell alias/function to `cd`.
 *
 * @returns The selected path or null if selection was canceled
 */
function handleFzfInteractiveMode(): string | null {
  const commandString = `fd --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --exclude .terraform --exclude .terragrunt-cache --color=never . "${baseSearchDir}" | sed 's/\\/*$//g' | fzf`;

  try {
    const proc = spawnSync(["sh", "-c", commandString], {
      stdio: ["ignore", "pipe", "inherit"], // stdin: ignore for script, pipe for fzf, stderr: inherit for fzf messages
    });

    if (proc.stdout) {
      const selectedPath = proc.stdout.toString().trim();
      if (selectedPath) {
        return selectedPath;
      }
    }

    if (proc.exitCode !== 0 && proc.exitCode !== 1 && proc.exitCode !== 130) {
      process.exit(proc.exitCode || 1);
    }

    return null;
  } catch (error: any) {
    return handleCommandError(error, "interactive fzf mode for ls", "sh, fd, sed, or fzf");
  }
}

/**
 * Handles the ls command implementation.
 */
export function handleLsCommand(): void {
  const selectedPath = handleFzfInteractiveMode();
  if (selectedPath) {
    handleCdToPath(selectedPath);
  }
  // If no path is selected (e.g., fzf cancelled), we simply exit (implicitly status 0).
  // The shell wrapper won't receive a "CD:" line and won't do anything.
}
