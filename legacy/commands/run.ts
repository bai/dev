import type { DevCommand } from "~/lib/core/command-types";
import { arg, runCommand as execCommand, getArg, validateArgs, validateTool } from "~/lib/core/command-utils";

export const runCommand: DevCommand = {
  name: "run",
  description: "Runs 'mise run <task>' to execute project tasks",
  help: `
The 'run' command executes project tasks using mise:

Examples:
  dev run build                    # Run the build task
  dev run test                     # Run the test task
  dev run lint --fix              # Run lint task with arguments
  dev run deploy production       # Run deploy task with production arg
  `,

  arguments: [
    arg("task", "Task to run", { required: true }),
    arg("args", "Additional arguments to pass to the task", { variadic: true }),
  ],

  async exec(context) {
    const { logger } = context;

    try {
      // Validate arguments
      validateArgs(context, ["task"]);

      // Validate that mise is available
      validateTool("mise", context);

      const task = getArg(context, "task");

      // Get variadic arguments - now properly collected by CommandLoader
      const additionalArgs = getArg(context, "args", []);

      // Build the command arguments: ['mise', 'run', task, ...additionalArgs]
      const command = ["mise", "run", task, ...additionalArgs];

      logger.info(`Running: ${command.join(" ")}`);

      // Execute the mise run command with all provided arguments
      execCommand(command, context, { inherit: true });
    } catch (error: any) {
      logger.error(`Run command failed: ${error.message}`);
      throw error;
    }
  },
};
