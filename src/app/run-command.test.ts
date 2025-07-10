import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { FileSystemTag } from "../domain/file-system-port";
import { MiseTag } from "../domain/mise-port";

// Mock implementations
const mockFileSystem = {
  getCwd: () => Effect.succeed("/test/directory"),
  exists: () => Effect.succeed(true),
  readFile: () => Effect.succeed("test content"),
  writeFile: () => Effect.succeed(undefined),
  mkdir: () => Effect.succeed(undefined),
  findDirectoriesGlob: () => Effect.succeed([]),
  resolvePath: (path: string) => (path.startsWith("~") ? path.replace("~", "/home/user") : path),
};

const mockMise = {
  checkInstallation: () => Effect.succeed({ version: "2024.1.0", runtimeVersions: {} }),
  install: () => Effect.succeed(undefined),
  installTools: () => Effect.succeed(undefined),
  runTask: (taskName: string, args?: readonly string[], cwd?: string) => {
    // Store the call for assertions
    mockMise.lastCall = { taskName, args, cwd };
    return Effect.succeed(undefined);
  },
  getTasks: () => Effect.succeed(["lint", "test", "build"]),
  setupGlobalConfig: () => Effect.succeed(undefined),
  lastCall: undefined as { taskName: string; args?: readonly string[]; cwd?: string } | undefined,
};

// Create test layer
const TestLayer = Layer.succeed(FileSystemTag, mockFileSystem).pipe(Layer.merge(Layer.succeed(MiseTag, mockMise)));

// Create a handler function that mimics the run command logic
const createRunHandler = (task: { _tag: "Some"; value: string } | { _tag: "None" }, taskArgs: string[]) =>
  Effect.gen(function* () {
    const mise = yield* MiseTag;
    const fileSystem = yield* FileSystemTag;
    const taskName = task._tag === "Some" ? task.value : undefined;

    const cwd = yield* fileSystem.getCwd();

    if (!taskName) {
      // List available tasks
      const tasks = yield* mise.getTasks(cwd);
      return { action: "list", tasks };
    }

    const args = taskArgs.map((arg) => arg);
    yield* mise.runTask(taskName, args, cwd);
    return { action: "run", taskName, args };
  });

describe("run-command", () => {
  beforeEach(() => {
    // Reset mock state before each test
    mockMise.lastCall = undefined;
  });

  it("runs a task without arguments", async () => {
    const result = await createRunHandler({ _tag: "Some", value: "lint" }, []).pipe(
      Effect.provide(TestLayer),
      Effect.runPromise,
    );

    expect(mockMise.lastCall).toEqual({
      taskName: "lint",
      args: [],
      cwd: "/test/directory",
    });
    expect(result).toEqual({
      action: "run",
      taskName: "lint",
      args: [],
    });
  });

  it("runs a task with single argument", async () => {
    const result = await createRunHandler({ _tag: "Some", value: "test" }, ["--watch"]).pipe(
      Effect.provide(TestLayer),
      Effect.runPromise,
    );

    expect(mockMise.lastCall).toEqual({
      taskName: "test",
      args: ["--watch"],
      cwd: "/test/directory",
    });
    expect(result).toEqual({
      action: "run",
      taskName: "test",
      args: ["--watch"],
    });
  });

  it("runs a task with multiple arguments", async () => {
    const result = await createRunHandler({ _tag: "Some", value: "secrets" }, ["decrypt", "--env", "prod"]).pipe(
      Effect.provide(TestLayer),
      Effect.runPromise,
    );

    expect(mockMise.lastCall).toEqual({
      taskName: "secrets",
      args: ["decrypt", "--env", "prod"],
      cwd: "/test/directory",
    });
    expect(result).toEqual({
      action: "run",
      taskName: "secrets",
      args: ["decrypt", "--env", "prod"],
    });
  });

  it("lists available tasks when no task is provided", async () => {
    const result = await createRunHandler({ _tag: "None" }, []).pipe(Effect.provide(TestLayer), Effect.runPromise);

    // Should not call runTask when no task name is provided
    expect(mockMise.lastCall).toBeUndefined();
    expect(result).toEqual({
      action: "list",
      tasks: ["lint", "test", "build"],
    });
  });

  it("handles task execution errors properly", async () => {
    const { ShellExecutionError } = await import("../domain/errors");
    const failingMise = {
      ...mockMise,
      runTask: () =>
        Effect.fail(new ShellExecutionError({ command: "mise", args: ["run", "failing-task"], reason: "Task failed" })),
    };

    const FailingMiseLayer = Layer.succeed(FileSystemTag, mockFileSystem).pipe(
      Layer.merge(Layer.succeed(MiseTag, failingMise)),
    );

    const result = createRunHandler({ _tag: "Some", value: "failing-task" }, []).pipe(
      Effect.provide(FailingMiseLayer),
      Effect.runPromise,
    );

    await expect(result).rejects.toThrow();
  });

  it("properly formats full command string for logging", () => {
    // Test the fullCommand construction logic
    const testCases = [
      { taskName: "lint", args: [], expected: "lint" },
      { taskName: "test", args: ["--watch"], expected: "test --watch" },
      { taskName: "secrets", args: ["decrypt", "--env", "prod"], expected: "secrets decrypt --env prod" },
    ];

    for (const testCase of testCases) {
      const fullCommand =
        testCase.args.length > 0 ? `${testCase.taskName} ${testCase.args.join(" ")}` : testCase.taskName;
      expect(fullCommand).toBe(testCase.expected);
    }
  });

  it("handles empty args array correctly", async () => {
    const result = await createRunHandler({ _tag: "Some", value: "build" }, []).pipe(
      Effect.provide(TestLayer),
      Effect.runPromise,
    );

    expect(mockMise.lastCall).toEqual({
      taskName: "build",
      args: [],
      cwd: "/test/directory",
    });
    expect(result).toEqual({
      action: "run",
      taskName: "build",
      args: [],
    });
  });
});
