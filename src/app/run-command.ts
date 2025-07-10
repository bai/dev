import { Args, Command } from "@effect/cli";
import { Effect } from "effect";

import { FileSystemTag } from "../domain/file-system-port";
import { MiseTag } from "../domain/mise-port";

// Define the task argument as optional
const task = Args.text({ name: "task" }).pipe(Args.optional);
// Define additional arguments as variadic
const taskArgs = Args.text({ name: "args" }).pipe(Args.repeated);

// Create the run command using @effect/cli
export const runCommand = Command.make("run", { task, taskArgs }, ({ task, taskArgs }) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Running command...");
    const mise = yield* MiseTag;
    const fileSystem = yield* FileSystemTag;
    const taskName = task._tag === "Some" ? task.value : undefined;

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

    const args = taskArgs.map((arg) => arg);
    const fullCommand = args.length > 0 ? `${taskName} ${args.join(" ")}` : taskName;

    yield* Effect.logInfo(`Running task: ${fullCommand}`);

    yield* mise.runTask(taskName, args, cwd);

    yield* Effect.logInfo(`✅ Task '${fullCommand}' completed successfully`);
  }),
);
