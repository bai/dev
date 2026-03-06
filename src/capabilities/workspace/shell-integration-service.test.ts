import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect } from "vitest";

import { FileSystemMock } from "~/capabilities/system/file-system-mock";
import { FileSystemTag } from "~/capabilities/system/file-system-port";
import { ShellIntegrationLiveLayer, ShellIntegrationTag } from "~/capabilities/workspace/shell-integration-service";
import { ConfigError } from "~/core/errors";
import { StatePathsTag, WorkspacePathsTag } from "~/core/runtime/path-service";
import { makeStatePathsMock, makeWorkspacePathsMock } from "~/core/runtime/path-service-mock";

const statePaths = makeStatePathsMock({
  stateDir: "/tmp/home/.dev/state",
  runDir: "/tmp/home/.dev/state/run",
});
const workspacePaths = makeWorkspacePathsMock("/tmp/workspace");

describe("shell-integration-service", () => {
  it.effect("resolves relative paths, trims trailing slash, and writes cd target", () =>
    Effect.gen(function* () {
      const fileSystem = new FileSystemMock();
      fileSystem.existingPaths.add("/tmp/workspace/github.com/acme/repo");

      const dependencies = Layer.mergeAll(
        Layer.succeed(StatePathsTag, statePaths),
        Layer.succeed(WorkspacePathsTag, workspacePaths),
        Layer.succeed(FileSystemTag, fileSystem),
      );
      const shellIntegrationLayer = Layer.provide(ShellIntegrationLiveLayer, dependencies);

      yield* Effect.gen(function* () {
        const shellIntegration = yield* ShellIntegrationTag;
        yield* shellIntegration.changeDirectory("github.com/acme/repo/");
      }).pipe(Effect.provide(shellIntegrationLayer));

      expect(fileSystem.mkdirCalls).toEqual([{ path: "/tmp/home/.dev/state/run", recursive: true }]);
      expect(fileSystem.writeFileCalls).toHaveLength(1);
      expect(fileSystem.writeFileCalls[0]?.path).toBe(`/tmp/home/.dev/state/run/cd_target.${process.ppid}`);
      expect(fileSystem.writeFileCalls[0]?.content).toBe("/tmp/workspace/github.com/acme/repo");
    }),
  );

  it.effect("uses absolute paths directly without prefixing baseSearchPath", () =>
    Effect.gen(function* () {
      const fileSystem = new FileSystemMock();
      fileSystem.existingPaths.add("/absolute/repo");

      const dependencies = Layer.mergeAll(
        Layer.succeed(StatePathsTag, statePaths),
        Layer.succeed(WorkspacePathsTag, workspacePaths),
        Layer.succeed(FileSystemTag, fileSystem),
      );
      const shellIntegrationLayer = Layer.provide(ShellIntegrationLiveLayer, dependencies);

      yield* Effect.gen(function* () {
        const shellIntegration = yield* ShellIntegrationTag;
        yield* shellIntegration.changeDirectory("/absolute/repo");
      }).pipe(Effect.provide(shellIntegrationLayer));

      expect(fileSystem.writeFileCalls[0]?.content).toBe("/absolute/repo");
    }),
  );

  it.effect("fails with ConfigError when target path does not exist", () =>
    Effect.gen(function* () {
      const fileSystem = new FileSystemMock();

      const dependencies = Layer.mergeAll(
        Layer.succeed(StatePathsTag, statePaths),
        Layer.succeed(WorkspacePathsTag, workspacePaths),
        Layer.succeed(FileSystemTag, fileSystem),
      );
      const shellIntegrationLayer = Layer.provide(ShellIntegrationLiveLayer, dependencies);

      const result = yield* Effect.exit(
        Effect.gen(function* () {
          const shellIntegration = yield* ShellIntegrationTag;
          yield* shellIntegration.changeDirectory("missing/repo");
        }).pipe(Effect.provide(shellIntegrationLayer)),
      );

      expect(Exit.isFailure(result)).toBe(true);
      expect(fileSystem.writeFileCalls).toHaveLength(0);

      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value).toBeInstanceOf(ConfigError);
        }
      }
    }),
  );
});
