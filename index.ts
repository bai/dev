import { spawnSync } from "bun";
import os from "os";
import path from "path";

const args = process.argv.slice(2); // Remove 'bun' and 'index.ts' / or executable name
const homeDir = os.homedir();
// Per instructions, search is in '~/src'
const baseSearchDir = path.join(homeDir, "src");

/**
 * Handles the interactive fzf mode when `dev` is called without arguments.
 * This function replicates the behavior of:
 * `cd $(fd . ~/src --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --color=never | sed "s/\/*$//g" | fzf)`
 * The script outputs the selected path to stdout, which is then used by a shell alias/function to `cd`.
 */
function handleFzfInteractiveMode() {
  // Construct the command for fd piped to sed and then fzf.
  // fd options:
  //   "${baseSearchDir}" : target directory for search.
  //   --type directory   : find directories.
  //   --exact-depth 3    : only directories at exactly this depth relative to baseSearchDir's items
  //                        (e.g., ~/src/category/project/target_at_depth_3).
  //   --follow           : follow symlinks.
  //   --hidden           : include hidden directories.
  //   --exclude .git     : exclude .git folders.
  //   --exclude node_modules: exclude node_modules folders.
  //   --color=never      : disable colors for piping.
  // sed 's/\\/*$//g'    : remove trailing slashes (JS string needs \\ for literal \).
  // fzf                  : interactive fuzzy finder.
  const commandString = `fd --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --color=never "${baseSearchDir}" | sed 's/\\\\/*$//g' | fzf`;

  try {
    const proc = spawnSync({
      cmd: ["sh", "-c", commandString],
      // stdin: inherit from user for fzf interaction.
      // stdout: pipe to capture fzf's selection.
      // stderr: inherit to show fzf's messages or errors from the shell pipeline.
      stdio: ["inherit", "pipe", "inherit"],
    });

    if (proc.stdout) {
      const selectedPath = proc.stdout.toString().trim();
      if (selectedPath) {
        process.stdout.write(selectedPath + "\n"); // Output selected path.
      }
      // If fzf is cancelled (e.g., Esc), selectedPath is empty.
      // Script outputs nothing to stdout, which is fine for `cd $(...)`.
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
 * Handles the direct cd mode, e.g., `dev cd my_folder_name`.
 * It looks for `my_folder_name` within `~/src` (recursively) and prints the full path if found.
 */
function handleDirectCdMode(folderName: string) {
  const fdCommandArgs = [
    "--type",
    "d", // Find directories.
    "--max-results",
    "1", // Stop after first match.
    "--hidden", // Include hidden directories.
    "--follow", // Follow symlinks.
    folderName, // The name of the folder to find (fd treats this as a pattern).
    baseSearchDir, // The directory to search within.
  ];

  try {
    const proc = spawnSync({
      cmd: ["fd", ...fdCommandArgs],
      stdio: ["ignore", "pipe", "pipe"], // stdin: ignore, stdout: capture, stderr: capture.
    });

    if (proc.success && proc.stdout) {
      const foundPath = proc.stdout.toString().trim();
      if (foundPath) {
        process.stdout.write(foundPath + "\n"); // Output found path.
      } else {
        // fd succeeded but found nothing (empty stdout).
        console.error(`Folder '${folderName}' not found in ${baseSearchDir}`);
        process.exit(1);
      }
    } else {
      // fd command failed or found nothing.
      let errorMessage = `Folder '${folderName}' not found or error during search in ${baseSearchDir}.`;
      if (proc.stderr && proc.stderr.length > 0) {
        const stderrStr = proc.stderr.toString().trim();
        if (stderrStr) {
          // Only add stderr details if there's content.
          errorMessage += `\nDetails: ${stderrStr}`;
        }
      }
      console.error(errorMessage);
      process.exit(1);
    }
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.error(
        "Error: 'fd' command not found. Please install fd and ensure it's in your PATH."
      );
    } else {
      console.error(`Failed to find folder '${folderName}': ${error.message}`);
    }
    process.exit(1);
  }
}

// Main CLI logic
if (args.length === 0) {
  handleFzfInteractiveMode();
} else if (args.length === 2 && args[0] === "cd") {
  const folderName = args[1];
  // Basic check, though process.argv usually provides non-empty strings for args.
  if (!folderName || folderName.trim() === "") {
    console.error("Error: Folder name for 'cd' command cannot be empty.");
    process.exit(1);
  }
  handleDirectCdMode(folderName);
} else {
  console.error(`dev: A CLI tool for quick directory navigation within ~/src.

Usage:
  dev                       Interactively select a directory from ~/src using fzf.
                            (Searches for directories at depth 3 in ~/src)

  dev cd <folder_name>      Finds and outputs the path to <folder_name> within ~/src.
                            (Searches recursively for a directory named <folder_name>)

Setup (add to your ~/.bashrc, ~/.zshrc, etc.):
  alias dev='. _dev_wrapper'
  _dev_wrapper() {
    local target_dir
    target_dir="$(bun /path/to/your/dev/index.ts "$@")"
    if [ -n "$target_dir" ]; then
      cd "$target_dir"
    fi
  }
  # Replace /path/to/your/dev/index.ts with the actual path to this script.
`);
  process.exit(1);
}
