import { Effect } from "effect";

import { unknownError, type DevError } from "../../domain/errors";
import { type CliCommandSpec, type CommandContext } from "../../domain/models";
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
      yield* Effect.logInfo("Running command...");
      const mise = yield* MiseService;
      const fileSystem = yield* FileSystemService;
      const taskName = context.args.task;

      const cwd = yield* fileSystem.getCwd();

      if (!taskName) {
        // List available tasks
        yield* Effect.logInfo("Available tasks:");

        const tasks = yield* mise.getTasks(cwd);

        if (tasks.length === 0) {
          yield* Effect.logInfo("No tasks found in current directory");
          return;
        }

        for (const task of tasks) {
          yield* Effect.logInfo(`  ${task}`);
        }
        return;
      }

      yield* Effect.logInfo(`Running task: ${taskName}`);

      yield* mise.runTask(taskName, cwd);

      yield* Effect.logInfo("✅ Task '${taskName}' completed successfully");
    });
  },
};
