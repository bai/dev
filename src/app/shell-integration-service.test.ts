import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect } from "vitest";

import { ConfigError } from "../domain/errors";
import type { FileSystem } from "../domain/file-system-port";
import { FileSystemTag } from "../domain/file-system-port";
import type { PathService } from "../domain/path-service";
import { PathServiceTag } from "../domain/path-service";
import { ShellIntegrationLiveLayer, ShellIntegrationTag } from "./shell-integration-service";

class MockFileSystem implements FileSystem {
  public existingPaths = new Set<string>();
  public mkdirCalls: Array<{ path: string; recursive?: boolean }> = [];
  public writeCalls: Array<{ path: string; content: string }> = [];

  readFile(_path: string): Effect.Effect<string, never, never> {
    return Effect.succeed("");
  }

  writeFile(path: string, content: string): Effect.Effect<void, never, never> {
    this.writeCalls.push({ path, content });
    return Effect.void;
  }

  exists(path: string): Effect.Effect<boolean, never, never> {
    return Effect.succeed(this.existingPaths.has(path));
  }

  mkdir(path: string, recursive?: boolean): Effect.Effect<void, never, never> {
    this.mkdirCalls.push({ path, recursive });
    return Effect.void;
  }

  findDirectoriesGlob(_basePath: string, _pattern: string): Effect.Effect<string[], never, never> {
    return Effect.succeed([]);
  }

  getCwd(): Effect.Effect<string, never, never> {
    return Effect.succeed("/tmp");
  }
}

const pathService: PathService = {
  homeDir: "/tmp/home",
  baseSearchPath: "/tmp/workspace",
  devDir: "/tmp/home/.dev",
  configDir: "/tmp/home/.config/dev",
  configPath: "/tmp/home/.config/dev/config.json",
  dataDir: "/tmp/home/.local/share/dev",
  dbPath: "/tmp/home/.local/share/dev/dev.db",
  cacheDir: "/tmp/home/.cache/dev",
  getBasePath: () => "/tmp/workspace",
};

describe("shell-integration-service", () => {
  it.effect("resolves relative paths, trims trailing slash, and writes cd target", () =>
    Effect.gen(function* () {
      const fileSystem = new MockFileSystem();
      fileSystem.existingPaths.add("/tmp/workspace/github.com/acme/repo");

      const dependencies = Layer.mergeAll(Layer.succeed(PathServiceTag, pathService), Layer.succeed(FileSystemTag, fileSystem));
      const shellIntegrationLayer = Layer.provide(ShellIntegrationLiveLayer, dependencies);

      yield* Effect.gen(function* () {
        const shellIntegration = yield* ShellIntegrationTag;
        yield* shellIntegration.changeDirectory("github.com/acme/repo/");
      }).pipe(Effect.provide(shellIntegrationLayer));

      expect(fileSystem.mkdirCalls).toEqual([{ path: "/tmp/home/.local/share/dev", recursive: true }]);
      expect(fileSystem.writeCalls).toHaveLength(1);
      expect(fileSystem.writeCalls[0]?.path).toBe(`/tmp/home/.local/share/dev/cd_target.${process.ppid}`);
      expect(fileSystem.writeCalls[0]?.content).toBe("/tmp/workspace/github.com/acme/repo");
    }),
  );

  it.effect("uses absolute paths directly without prefixing baseSearchPath", () =>
    Effect.gen(function* () {
      const fileSystem = new MockFileSystem();
      fileSystem.existingPaths.add("/absolute/repo");

      const dependencies = Layer.mergeAll(Layer.succeed(PathServiceTag, pathService), Layer.succeed(FileSystemTag, fileSystem));
      const shellIntegrationLayer = Layer.provide(ShellIntegrationLiveLayer, dependencies);

      yield* Effect.gen(function* () {
        const shellIntegration = yield* ShellIntegrationTag;
        yield* shellIntegration.changeDirectory("/absolute/repo");
      }).pipe(Effect.provide(shellIntegrationLayer));

      expect(fileSystem.writeCalls[0]?.content).toBe("/absolute/repo");
    }),
  );

  it.effect("fails with ConfigError when target path does not exist", () =>
    Effect.gen(function* () {
      const fileSystem = new MockFileSystem();

      const dependencies = Layer.mergeAll(Layer.succeed(PathServiceTag, pathService), Layer.succeed(FileSystemTag, fileSystem));
      const shellIntegrationLayer = Layer.provide(ShellIntegrationLiveLayer, dependencies);

      const result = yield* Effect.exit(
        Effect.gen(function* () {
          const shellIntegration = yield* ShellIntegrationTag;
          yield* shellIntegration.changeDirectory("missing/repo");
        }).pipe(Effect.provide(shellIntegrationLayer)),
      );

      expect(Exit.isFailure(result)).toBe(true);
      expect(fileSystem.writeCalls).toHaveLength(0);

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
