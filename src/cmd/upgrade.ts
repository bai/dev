import { spawnSync } from "bun";
import path from "path";
import { homeDir, handleCommandError, stdioInherit } from "~/utils";

/**
 * Handles the 'upgrade' subcommand.
 * Runs the setup script to update the dev CLI tool.
 */
export function handleUpgradeCommand(): void {
  try {
    console.log("Upgrading dev CLI tool...");
    const setupScriptPath = path.join(homeDir, ".dev", "hack", "setup.sh");

    const proc = spawnSync(["bash", setupScriptPath], {
      stdio: stdioInherit, // Inherit all IO to pass through to the user
    });

    if (proc.exitCode !== 0) {
      console.error("Error running dev upgrade command");
      process.exit(proc.exitCode || 1);
    }

    console.log("dev CLI tool successfully upgraded!");
  } catch (error: any) {
    handleCommandError(error, "upgrade", "bash");
  }
}
