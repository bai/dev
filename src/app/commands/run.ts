import type { CliCommandSpec, CommandContext } from "../../domain/models";
import type { FileSystem } from "../../domain/ports/FileSystem";
import type { Mise } from "../../domain/ports/Mise";

interface RunContext extends CommandContext {
  mise: Mise;
  fileSystem: FileSystem;
}

export const runCommand: CliCommandSpec = {
  name: "run",
  description: "Run a task using mise",
  help: `
Run development tasks:

Usage:
  dev run <task>          # Run a specific task
  dev run                 # List available tasks

Examples:
  dev run test            # Run tests
  dev run build           # Run build task
  dev run dev             # Start development server
  `,

  arguments: [
    {
      name: "task",
      description: "Task name to run",
      required: false,
    },
  ],

  async exec(context: CommandContext): Promise<void> {
    const ctx = context as RunContext;
    const taskName = ctx.args.task;

    const cwd = await ctx.fileSystem.getCwd();

    if (!taskName) {
      // List available tasks
      ctx.logger.info("Available tasks:");

      const tasks = await ctx.mise.getTasks(cwd);

      if (typeof tasks === "object" && "_tag" in tasks) {
        ctx.logger.error(`Failed to get tasks: ${tasks.reason}`);
        throw tasks;
      }

      if (tasks.length === 0) {
        ctx.logger.info("No tasks found in current directory");
        return;
      }

      for (const task of tasks) {
        ctx.logger.info(`  ${task}`);
      }
      return;
    }

    ctx.logger.info(`Running task: ${taskName}`);

    const result = await ctx.mise.runTask(taskName, cwd);

    if (typeof result === "object" && "_tag" in result) {
      ctx.logger.error(`Task failed: ${result.reason}`);
      throw result;
    }

    ctx.logger.success(`Task '${taskName}' completed successfully`);
  },
};
