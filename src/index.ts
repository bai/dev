import { spawnSync } from "bun";
import os from "os";
import path from "path";

const args = process.argv.slice(2); // Remove 'bun' and 'index.ts' / or executable name
const homeDir = os.homedir();
// Per instructions, search is in '~/src'
const baseSearchDir = path.join(homeDir, "src");

/**
 * Handles the interactive fzf mode when `dev cd` is called without additional arguments.
 * This function uses fzf to interactively select from directories at the third level in ~/src.
 * (e.g., ~/src/github.com/bai/dev, where "dev" is at the third level)
 * The script outputs the selected path to stdout, which is then used by a shell alias/function to `cd`.
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
      stdio: ["ignore", "pipe", "pipe"] as any,
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
    // This catch block handles errors from spawnSync itself (e.g., 'sh' not found).
    if (error.code === "ENOENT") {
      console.error(
        "Error: A required command (sh, fd, sed, or fzf) could not be found. Please ensure they are installed and in your PATH."
      );
    } else {
      console.error(`Failed to execute interactive fzf mode: ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Handles the direct cd mode, e.g., `dev cd dev`.
 * It looks for directories matching the given name at the third level in ~/src and
 * picks the best matching one to cd into.
 */
function handleDirectCdMode(folderName: string): string | null {
  // First, limit search to exact-depth 3 directories where the last path component contains the given name
  // This matches the requirement to find things like ~/src/github.com/bai/dev
  // Always use the absolute path to baseSearchDir (~/src) regardless of current working directory
  const commandString = `fd --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --color=never -g "*/${folderName}$" "${baseSearchDir}" | sed 's/\\/*$//g' | sort -r | head -n 1`;

  try {
    const proc = spawnSync(["sh", "-c", commandString], {
      stdio: ["ignore", "pipe", "pipe"] as const, // stdin: ignore, stdout: capture, stderr: capture.
    });

    if (proc.stdout) {
      const foundPath = proc.stdout.toString().trim();
      if (foundPath) {
        return foundPath; // Return found path.
      }
    }

    // If no exact match at the end path component, try to find partial matches
    // Always search in baseSearchDir (~/src) regardless of current working directory
    const fuzzyCommandString = `fd --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --color=never . "${baseSearchDir}" | grep -i "${folderName}" | sed 's/\\/*$//g' | sort -r | head -n 1`;

    const fuzzyProc = spawnSync(["sh", "-c", fuzzyCommandString], {
      stdio: ["ignore", "pipe", "pipe"] as const, // stdin: ignore, stdout: capture, stderr: capture.
    });

    if (fuzzyProc.stdout) {
      const foundPath = fuzzyProc.stdout.toString().trim();
      if (foundPath) {
        return foundPath; // Return found path.
      }
    }

    // Nothing found
    console.error(`Folder '${folderName}' not found in ${baseSearchDir}`);
    process.exit(1);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.error(
        "Error: A required command (sh, fd, sed, grep, sort, or head) could not be found. Please ensure they are installed and in your PATH."
      );
    } else {
      console.error(`Failed to find folder '${folderName}': ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Handles the 'up' subcommand.
 * Runs 'mise up' command directly.
 */
function handleUpCommand() {
  try {
    const proc = spawnSync(["mise", "up"], {
      stdio: ["inherit", "inherit", "inherit"] as any, // Inherit all IO to pass through to the user
    });

    if (proc.exitCode !== 0) {
      console.error("Error running 'mise up' command");
      process.exit(proc.exitCode || 1);
    }
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.error(
        "Error: 'mise' command not found. Please ensure it's installed and in your PATH."
      );
    } else {
      console.error(`Failed to execute 'mise up': ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Handles the 'upgrade' subcommand.
 * Runs the setup script to update the dev CLI tool.
 */
function handleUpgradeCommand() {
  try {
    console.log("Upgrading dev CLI tool...");
    const setupScriptPath = path.join(homeDir, ".dev", "hack", "setup.sh");

    const proc = spawnSync(["bash", setupScriptPath], {
      stdio: ["inherit", "inherit", "inherit"] as any, // Inherit all IO to pass through to the user
    });

    if (proc.exitCode !== 0) {
      console.error("Error running dev upgrade command");
      process.exit(proc.exitCode || 1);
    }

    console.log("dev CLI tool successfully upgraded!");
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.error(
        "Error: Could not find setup script. Please ensure the dev repository is properly installed."
      );
    } else {
      console.error(`Failed to execute upgrade command: ${error.message}`);
    }
    process.exit(1);
  }
}

/**
 * Handles changing directory. Since Node.js/Bun can't change the parent process directory,
 * we output a special format that the shell wrapper will interpret.
 */
function handleCdToPath(targetPath: string) {
  // Special format for the shell wrapper to interpret: "CD:<path>"
  console.log(`CD:${targetPath}`);
  process.exit(0);
}

// Main CLI logic
if (args.length === 0) {
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
} else if (args.length === 1 && args[0] === "cd") {
  // When just "dev cd" is run, handle interactive fuzzy selection
  const selectedPath = handleFzfInteractiveMode();
  if (selectedPath) {
    handleCdToPath(selectedPath);
  }
} else if (args.length === 2 && args[0] === "cd") {
  const folderName = args[1];
  // Basic check, though process.argv usually provides non-empty strings for args.
  if (!folderName || folderName.trim() === "") {
    console.error("Error: Folder name for 'cd' command cannot be empty.");
    process.exit(1);
  }
  const targetPath = handleDirectCdMode(folderName);
  if (targetPath) {
    handleCdToPath(targetPath);
  }
} else if (args.length === 1 && args[0] === "up") {
  // Handle 'dev up' command
  handleUpCommand();
} else if (args.length === 1 && args[0] === "upgrade") {
  // Handle 'dev upgrade' command
  handleUpgradeCommand();
} else {
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
