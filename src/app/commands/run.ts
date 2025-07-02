import { Effect } from "effect";

import { unknownError, type DevError } from "../../domain/errors";
import { LoggerService, type CliCommandSpec, type CommandContext } from "../../domain/models";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { MiseService } from "../../domain/ports/Mise";

// Interface removed - services now accessed via Effect Context

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

  exec(context: CommandContext): Effect.Effect<void, DevError, any> {
    return Effect.gen(function* () {
      const logger = yield* LoggerService;
      const mise = yield* MiseService;
      const fileSystem = yield* FileSystemService;
      const taskName = context.args.task;

      const cwd = yield* fileSystem.getCwd();

      if (!taskName) {
        // List available tasks
        yield* logger.info("Available tasks:");

        const tasks = yield* mise.getTasks(cwd);

        if (tasks.length === 0) {
          yield* logger.info("No tasks found in current directory");
          return;
        }

        for (const task of tasks) {
          yield* logger.info(`  ${task}`);
        }
        return;
      }

      yield* logger.info(`Running task: ${taskName}`);

      yield* mise.runTask(taskName, cwd);

      yield* logger.success(`Task '${taskName}' completed successfully`);
    });
  },
};
