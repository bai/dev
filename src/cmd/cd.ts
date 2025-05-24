import { spawnSync } from "bun";
import { handleCommandError, handleCdToPath } from "~/utils";
import { stdioPipe } from "~/utils/constants";
import { baseSearchDir } from "~/utils/constants";

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
  const commandString = `fd --type directory --exact-depth 3 --follow --hidden --exclude .git --exclude node_modules --color=never . "${baseSearchDir}" | sed 's/\\/*$//g' | fzy -e "${folderName}" | head -n 1`;

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
