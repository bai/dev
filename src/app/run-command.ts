import { Args, Command } from "@effect/cli";
import { Effect } from "effect";

import { FileSystemPortTag } from "../domain/file-system-port";
import { MisePortTag } from "../domain/mise-port";

// Define the task argument as optional
const task = Args.text({ name: "task" }).pipe(Args.optional);

// Create the run command using @effect/cli
export const runCommand = Command.make("run", { task }, ({ task }) =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Running command...");
    const mise = yield* MisePortTag;
    const fileSystem = yield* FileSystemPortTag;
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

    yield* Effect.logInfo(`Running task: ${taskName}`);

    yield* mise.runTask(taskName, cwd);

    yield* Effect.logInfo(`✅ Task '${taskName}' completed successfully`);
  }),
);
