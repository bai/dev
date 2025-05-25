import { spawnSync } from "bun";

import { baseSearchDir } from "~/lib/constants";
import { handleCdToPath, handleCommandError } from "~/lib/handlers";

/**
 * Handles the interactive fzf mode when `dev ls` is called.
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
