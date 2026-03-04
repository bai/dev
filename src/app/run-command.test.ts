import { Command } from "@effect/cli";
import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect } from "vitest";

import { ShellExecutionError } from "../domain/errors";
import type { FileSystem } from "../domain/file-system-port";
import { FileSystemTag } from "../domain/file-system-port";
import type { Mise } from "../domain/mise-port";
import { MiseTag } from "../domain/mise-port";
import { runCommand } from "./run-command";

interface MiseCallState {
  readonly getTasksCalls: Array<string | undefined>;
  readonly runTaskCalls: Array<{
    readonly taskName: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
  }>;
}

const makeFileSystem = (cwd = "/test/directory"): FileSystem => ({
  getCwd: () => Effect.succeed(cwd),
  exists: () => Effect.succeed(true),
  readFile: () => Effect.succeed("test content"),
  writeFile: () => Effect.void,
  mkdir: () => Effect.void,
  findDirectoriesGlob: () => Effect.succeed([]),
  resolvePath: (path) => (path.startsWith("~") ? path.replace("~", "/home/user") : path),
});

const makeMise = (
  overrides: {
    readonly runTask?: Mise["runTask"];
    readonly getTasks?: Mise["getTasks"];
  } = {},
): { readonly mise: Mise; readonly state: MiseCallState } => {
  const state: MiseCallState = {
    getTasksCalls: [],
    runTaskCalls: [],
  };

  const mise: Mise = {
    checkInstallation: () => Effect.succeed({ version: "2026.1.0", runtimeVersions: {} }),
    install: () => Effect.void,
    installTools: () => Effect.void,
    runTask: (taskName, args, cwd) =>
      Effect.gen(function* () {
        state.runTaskCalls.push({ taskName, args, cwd });

        if (overrides.runTask) {
          yield* overrides.runTask(taskName, args, cwd);
        }
      }),
    getTasks: (cwd) =>
      Effect.gen(function* () {
        state.getTasksCalls.push(cwd);

        if (overrides.getTasks) {
          return yield* overrides.getTasks(cwd);
        }

        return ["lint", "test", "build"];
      }),
    setupGlobalConfig: () => Effect.void,
  };

  return { mise, state };
};

const runRunCommand = (args: readonly string[], fileSystem: FileSystem, mise: Mise) => {
  const dependencies = Layer.mergeAll(Layer.succeed(FileSystemTag, fileSystem), Layer.succeed(MiseTag, mise));

  return Command.run(runCommand, { name: "dev", version: "0.0.0" })(["node", "dev", ...args]).pipe(
    Effect.provide(dependencies),
  ) as Effect.Effect<void, unknown, never>;
};

describe("run-command", () => {
  it.effect("runs a task without arguments", () =>
    Effect.gen(function* () {
      const fileSystem = makeFileSystem();
      const { mise, state } = makeMise();

      yield* runRunCommand(["lint"], fileSystem, mise);

      expect(state.getTasksCalls).toEqual([]);
      expect(state.runTaskCalls).toEqual([
        {
          taskName: "lint",
          args: [],
          cwd: "/test/directory",
        },
      ]);
    }),
  );

  it.effect("runs a task with arguments", () =>
    Effect.gen(function* () {
      const fileSystem = makeFileSystem();
      const { mise, state } = makeMise();

      yield* runRunCommand(["test", "--watch", "--coverage"], fileSystem, mise);

      expect(state.getTasksCalls).toEqual([]);
      expect(state.runTaskCalls).toEqual([
        {
          taskName: "test",
          args: ["--watch", "--coverage"],
          cwd: "/test/directory",
        },
      ]);
    }),
  );

  it.effect("lists available tasks when no task is provided", () =>
    Effect.gen(function* () {
      const fileSystem = makeFileSystem();
      const { mise, state } = makeMise();

      yield* runRunCommand([], fileSystem, mise);

      expect(state.getTasksCalls).toEqual(["/test/directory"]);
      expect(state.runTaskCalls).toEqual([]);
    }),
  );

  it.effect("propagates runTask failures from the Mise port", () =>
    Effect.gen(function* () {
      const fileSystem = makeFileSystem();
      const expectedError = new ShellExecutionError({
        command: "mise",
        args: ["run", "failing-task"],
        reason: "Task failed",
      });

      const { mise, state } = makeMise({
        runTask: () => Effect.fail(expectedError),
      });

      const result = yield* Effect.exit(runRunCommand(["failing-task"], fileSystem, mise));

      expect(Exit.isFailure(result)).toBe(true);
      expect(state.runTaskCalls).toHaveLength(1);

      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);

        if (Option.isSome(failure)) {
          expect(failure.value).toStrictEqual(expectedError);
        }
      }
    }),
  );
});
