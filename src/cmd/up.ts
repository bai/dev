import { spawnSync } from "bun";
import { handleCommandError, stdioInherit } from "~/utils";

/**
 * Handles the 'up' subcommand.
 * Runs 'mise up' command directly to update development tools.
 */
export function handleUpCommand(): void {
  try {
    const proc = spawnSync(["mise", "up"], {
      stdio: stdioInherit, // Inherit all IO to pass through to the user
    });

    if (proc.exitCode !== 0) {
      console.error("Error running 'mise up' command");
      process.exit(proc.exitCode || 1);
    }
  } catch (error: any) {
    handleCommandError(error, "mise up", "mise");
  }
}
