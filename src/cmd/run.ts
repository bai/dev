import { spawnSync } from "bun";
import { handleCommandError } from "~/utils";

/**
 * Handles the 'run' subcommand.
 * Executes 'mise run <task>' with the provided task arguments.
 * All arguments after 'run' are passed through to the mise command.
 */
export function handleRunCommand(args: string[]): void {
  try {
    // Validate that at least one task argument is provided
    if (args.length === 0) {
      console.error("❌ Error: No task specified");
      console.error("📖 Usage: dev run <task> [additional_args...]");
      console.error("💡 Example: dev run my_super_task");
      process.exit(1);
    }

    // Build the command arguments: ['mise', 'run', ...args]
    const command = ["mise", "run", ...args];

    console.log(`🚀 Running: ${command.join(" ")}`);

    // Execute the mise run command with all provided arguments
    const proc = spawnSync(command, {
      stdio: ["ignore", "inherit", "inherit"], // Inherit stdout and stderr to pass through to the user
    });

    // Exit with the same code as the mise command
    if (proc.exitCode !== 0) {
      process.exit(proc.exitCode || 1);
    }
  } catch (error: any) {
    handleCommandError(error, `mise run ${args.join(" ")}`, "mise");
  }
}
