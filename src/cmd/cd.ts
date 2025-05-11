import { spawnSync } from "bun";
import { baseSearchDir, handleCommandError, handleCdToPath, stdioPipe } from "~/utils";

/**
 * Handles the cd command implementation.
 *
 * @param args Command arguments (excluding the 'cd' part)
 */
export function handleCdCommand(args: string[]): void {
  if (args.length === 0) {
    // When just "dev cd" is run, handle interactive fuzzy selection
    const selectedPath = handleFzfInteractiveMode();
    if (selectedPath) {
      handleCdToPath(selectedPath);
    }
  } else if (args.length === 1) {
    const folderName = args[0];
    // Basic check, though process.argv usually provides non-empty strings for args.
    if (!folderName || folderName.trim() === "") {
      console.error("Error: Folder name for 'cd' command cannot be empty.");
      process.exit(1);
    }
    const targetPath = handleDirectCdMode(folderName);
    if (targetPath) {
      handleCdToPath(targetPath);
    }
  } else {
    console.error("Error: Too many arguments for 'cd' command.");
    process.exit(1);
  }
}

/**
 * Handles the interactive fzf mode when `dev cd` is called without additional arguments.
 * This function uses fzf to interactively select from directories at the third level in ~/src.
 * (e.g., ~/src/github.com/bai/dev, where "dev" is at the third level)
 * The script outputs the selected path to stdout, which is then used by a shell alias/function to `cd`.
 *
 * @returns The selected path or null if selection was canceled
 */
function handleFzfInteractiveMode(): string | null {
  // Construct the command for fd piped to sed and then fzf.
  // fd options:
  //   .                  : pattern to match (anything), searches in baseSearchDir.
  //   "${baseSearchDir}" : target directory for search.
  //   --type directory   : find directories.
  //   --exact-depth 3    : only directories at exactly this depth relative to baseSearchDir's items
  //                        (e.g., ~/src/github.com/bai/dev).
  //   --follow           : follow symlinks.
  //   --hidden           : include hidden directories.
  //   --exclude .git     : exclude .git folders.
  //   --exclude node_modules: exclude node_modules folders.
  //   --color=never      : disable colors for piping.
  // sed 's/\/*$//g'     : remove trailing slashes (JS string needs \\ for literal \ so sed sees \/).
  // fzf                  : interactive fuzzy finder.
  const commandString = `fd --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --color=never . "${baseSearchDir}" | sed 's/\\/*$//g' | fzf`;

  try {
    // Changed spawnSync call style to resolve TypeScript lint error and align with common usage.
    // The previous form spawnSync({ cmd: [...] }) was causing a type mismatch with some Bun versions/type definitions.
    // This form spawnSync(cmdArray, options) is clearer and type-checks correctly.
    const proc = spawnSync(["sh", "-c", commandString], {
      // stdin: inherit from user for fzf interaction.
      // stdout: pipe to capture fzf's selection.
      // stderr: inherit to show fzf's messages or errors from the shell pipeline.
      stdio: ["inherit", "pipe", "pipe"],
    });

    if (proc.stdout) {
      const selectedPath = proc.stdout.toString().trim();
      if (selectedPath) {
        return selectedPath; // Return selected path.
      }
      // If fzf is cancelled (e.g., Esc), selectedPath is empty.
    }

    // fzf typically exits with:
    // 0: successful selection
    // 1: no match / fzf aborted by typing (e.g. query that results in no match)
    // 130: aborted by user (e.g. Esc, Ctrl-C)
    // We don't treat 1 or 130 as script errors needing a non-zero exit from this script,
    // as an empty stdout is the correct signal to the wrapping `cd $(...)`.
    // Other non-zero exit codes from `sh -c` (e.g., 127 if fd/sed not found) will be reflected
    // by `proc.exitCode`. stderr is inherited, so user sees shell errors.
    // If the shell command itself fails (e.g. fd not found), proc.exitCode will be non-zero.
    // In such cases, stderr (inherited) should inform the user.
    // This script can exit 0 unless `sh -c` itself had a critical error not covered by ENOENT.
    if (proc.exitCode !== 0 && proc.exitCode !== 1 && proc.exitCode !== 130) {
      // This indicates an unexpected error in the shell pipeline (e.g., command not found).
      // stderr is inherited, so the user should see the error message from the shell.
      // We might choose to exit with that error code.
      process.exit(proc.exitCode || 1);
    }

    return null;
  } catch (error: any) {
    return handleCommandError(
      error,
      "interactive fzf mode",
      "sh, fd, sed, or fzf"
    );
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
  // Use fzf in non-interactive mode to perform fuzzy matching
  // This will find the best match for the given folder name at the third level
  const commandString = `fd --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --color=never . "${baseSearchDir}" | sed 's/\\/*$//g' | fzf -f "${folderName}" | sort -r | head -n 1`;

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

    // If no match found with fzf fuzzy search, try a more lenient grep-based search
    // This is a fallback in case fzf doesn't find anything
    const grepCommandString = `fd --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --color=never . "${baseSearchDir}" | grep -i "${folderName}" | sed 's/\\/*$//g' | sort -r | head -n 1`;

    const grepProc = spawnSync(["sh", "-c", grepCommandString], {
      stdio: stdioPipe, // stdin: ignore, stdout: capture, stderr: capture.
    });

    if (grepProc.stdout) {
      const foundPath = grepProc.stdout.toString().trim();
      if (foundPath) {
        return foundPath; // Return found path.
      }
    }

    // Nothing found
    console.error(`Folder '${folderName}' not found in ${baseSearchDir}`);
    process.exit(1);
  } catch (error: any) {
    return handleCommandError(
      error,
      `find folder '${folderName}'`,
      "sh, fd, sed, fzf, grep, sort, or head"
    );
  }
}
