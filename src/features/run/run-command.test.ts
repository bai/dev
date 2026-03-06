import { Command } from "@effect/cli";
import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect } from "vitest";

import type { FileSystem } from "~/capabilities/system/file-system-port";
import { FileSystemTag } from "~/capabilities/system/file-system-port";
import { MiseMock } from "~/capabilities/tools/mise-mock";
import { MiseTag } from "~/capabilities/tools/mise-port";
import { ShellExecutionError } from "~/core/errors";
import { runCommand } from "~/features/run/run-command";

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
});

const makeMise = (
  overrides: {
    readonly runTask?: MiseMock["runTask"];
    readonly getTasks?: MiseMock["getTasks"];
  } = {},
): { readonly mise: MiseMock; readonly state: MiseCallState } => {
  const mise = new MiseMock({
    tasks: ["lint", "test", "build"],
    overrides,
  });

  return {
    mise,
    state: {
      getTasksCalls: mise.getTasksCalls,
      runTaskCalls: mise.runTaskCalls,
    },
  };
};

const runRunCommand = (args: readonly string[], fileSystem: FileSystem, mise: MiseMock) => {
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
