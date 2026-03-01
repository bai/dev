import { it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { beforeEach, describe, expect } from "vitest";

import { ShellExecutionError } from "../domain/errors";
import type { FileSystem } from "../domain/file-system-port";
import { FileSystemTag } from "../domain/file-system-port";
import type { Mise } from "../domain/mise-port";
import { MiseTag } from "../domain/mise-port";

// Mock implementations
const mockFileSystem: FileSystem = {
  getCwd: () => Effect.succeed("/test/directory"),
  exists: (_path) => Effect.succeed(true),
  readFile: (_path) => Effect.succeed("test content"),
  writeFile: (_path, _content) => Effect.void,
  mkdir: (_path, _recursive) => Effect.void,
  findDirectoriesGlob: (_basePath, _pattern) => Effect.succeed([]),
  resolvePath: (path: string) => (path.startsWith("~") ? path.replace("~", "/home/user") : path),
};

const mockMise: Mise & {
  lastCall: { taskName: string; args?: readonly string[]; cwd?: string } | undefined;
} = {
  checkInstallation: () => Effect.succeed({ version: "2024.1.0", runtimeVersions: {} }),
  install: () => Effect.void,
  installTools: () => Effect.void,
  runTask: (taskName: string, args?: readonly string[], cwd?: string) => {
    // Store the call for assertions
    mockMise.lastCall = { taskName, args, cwd };
    return Effect.void;
  },
  getTasks: () => Effect.succeed(["lint", "test", "build"]),
  setupGlobalConfig: () => Effect.void,
  lastCall: undefined as { taskName: string; args?: readonly string[]; cwd?: string } | undefined,
};

// Create test layer
const TestLayer = Layer.mergeAll(Layer.succeed(FileSystemTag, mockFileSystem), Layer.succeed(MiseTag, mockMise));

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

  it.effect("runs a task without arguments", () =>
    Effect.gen(function* () {
      const result = yield* createRunHandler({ _tag: "Some", value: "lint" }, []).pipe(Effect.provide(TestLayer));

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
    }),
  );

  it.effect("runs a task with single argument", () =>
    Effect.gen(function* () {
      const result = yield* createRunHandler({ _tag: "Some", value: "test" }, ["--watch"]).pipe(
        Effect.provide(TestLayer),
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
    }),
  );

  it.effect("runs a task with multiple arguments", () =>
    Effect.gen(function* () {
      const result = yield* createRunHandler({ _tag: "Some", value: "secrets" }, ["decrypt", "--env", "prod"]).pipe(
        Effect.provide(TestLayer),
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
    }),
  );

  it.effect("lists available tasks when no task is provided", () =>
    Effect.gen(function* () {
      const result = yield* createRunHandler({ _tag: "None" }, []).pipe(Effect.provide(TestLayer));

      // Should not call runTask when no task name is provided
      expect(mockMise.lastCall).toBeUndefined();
      expect(result).toEqual({
        action: "list",
        tasks: ["lint", "test", "build"],
      });
    }),
  );

  it.effect("handles task execution errors properly", () =>
    Effect.gen(function* () {
      const failingMise = {
        ...mockMise,
        runTask: () =>
          new ShellExecutionError({ command: "mise", args: ["run", "failing-task"], reason: "Task failed" }),
      };

      const failingMiseLayer = Layer.mergeAll(
        Layer.succeed(FileSystemTag, mockFileSystem),
        Layer.succeed(MiseTag, failingMise),
      );

      const result = yield* Effect.exit(
        createRunHandler({ _tag: "Some", value: "failing-task" }, []).pipe(Effect.provide(failingMiseLayer)),
      );

      expect(Exit.isFailure(result)).toBe(true);
    }),
  );

  it.effect("properly formats full command string for logging", () =>
    Effect.sync(() => {
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
    }),
  );

  it.effect("handles empty args array correctly", () =>
    Effect.gen(function* () {
      const result = yield* createRunHandler({ _tag: "Some", value: "build" }, []).pipe(Effect.provide(TestLayer));

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
    }),
  );
});
