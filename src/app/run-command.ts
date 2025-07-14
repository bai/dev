import { Args, Command } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistryTag } from "../domain/command-registry-port";
import { FileSystemTag } from "../domain/file-system-port";
import { MiseTag } from "../domain/mise-port";

/**
 * Display help for the run command
 */
export const displayHelp = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Execute project tasks and scripts using mise\n");

    yield* Effect.logInfo("USAGE");
    yield* Effect.logInfo("  dev run [task] [args...]\n");

    yield* Effect.logInfo("EXAMPLES");
    yield* Effect.logInfo("  dev run                    # List available tasks");
    yield* Effect.logInfo("  dev run start              # Run the 'start' task");
    yield* Effect.logInfo("  dev run test --watch       # Run 'test' with arguments");
    yield* Effect.logInfo("  dev run build --production # Run 'build' with flags\n");

    yield* Effect.logInfo("ARGUMENTS");
    yield* Effect.logInfo("  task                      # Optional task name");
    yield* Effect.logInfo("  args...                   # Additional arguments for the task\n");
  });

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
    yield* Effect.annotateCurrentSpan("operation.type", taskName ? "run" : "list");
    if (taskName) {
      yield* Effect.annotateCurrentSpan("task.name", taskName);
    }

    const cwd = yield* fileSystem.getCwd().pipe(Effect.withSpan("filesystem.get_cwd"));
    yield* Effect.annotateCurrentSpan("process.working_directory", cwd);

    if (!taskName) {
      // List available tasks
      yield* Effect.logInfo("Available tasks:");

      const tasks = yield* mise.getTasks(cwd).pipe(Effect.withSpan("mise.get_tasks"));
      yield* Effect.annotateCurrentSpan("task.count", tasks.length.toString());

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

    yield* Effect.annotateCurrentSpan("task.command", taskName);
    yield* Effect.annotateCurrentSpan("task.args.count", args.length.toString());
    yield* Effect.annotateCurrentSpan("task.args", args);
    yield* Effect.annotateCurrentSpan("task.command.full", fullCommand);

    yield* mise.runTask(taskName, args, cwd).pipe(Effect.withSpan("mise.run_task"));

    yield* Effect.logInfo(`✅ Task '${fullCommand}' completed successfully`);
  }).pipe(Effect.withSpan("run.execute")),
);

/**
 * Register the run command with the command registry
 */
export const registerRunCommand: Effect.Effect<void, never, CommandRegistryTag> = Effect.gen(function* () {
  const registry = yield* CommandRegistryTag;
  yield* registry.register({
    name: "run",
    command: runCommand as Command.Command<string, never, any, any>,
    displayHelp,
  });
});
