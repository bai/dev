import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import type { Config } from "../domain/config-schema";
import type { FileSystem } from "../domain/file-system-port";
import type { PathService } from "../domain/path-service";
import type { Shell, SpawnResult } from "../domain/shell-port";
import { makeGcloudToolsLive } from "./gcloud-tools-live";

class MockShell implements Shell {
  public readonly execCalls: Array<{
    readonly command: string;
    readonly args: readonly string[];
    readonly options?: { readonly cwd?: string };
  }> = [];

  exec(
    command: string,
    args: string[] = [],
    options?: {
      readonly cwd?: string;
    },
  ): Effect.Effect<SpawnResult, never> {
    this.execCalls.push({ command, args, options });
    return Effect.succeed({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  }

  execInteractive(
    _command: string,
    _args: string[] = [],
    _options?: {
      readonly cwd?: string;
    },
  ): Effect.Effect<number, never> {
    return Effect.succeed(0);
  }

  setProcessCwd(_path: string): Effect.Effect<void> {
    return Effect.void;
  }
}

class MockFileSystem implements FileSystem {
  public readonly existingPaths = new Set<string>();
  public readonly existsCalls: string[] = [];
  public readonly mkdirCalls: Array<{ readonly path: string; readonly recursive?: boolean }> = [];

  readFile(_path: string): Effect.Effect<string, never> {
    return Effect.succeed("");
  }

  writeFile(_path: string, _content: string): Effect.Effect<void, never> {
    return Effect.void;
  }

  exists(path: string): Effect.Effect<boolean, never> {
    this.existsCalls.push(path);
    return Effect.succeed(this.existingPaths.has(path));
  }

  mkdir(path: string, recursive?: boolean): Effect.Effect<void, never> {
    this.mkdirCalls.push({ path, recursive });
    this.existingPaths.add(path);
    return Effect.void;
  }

  findDirectoriesGlob(_basePath: string, _pattern: string): Effect.Effect<string[], never> {
    return Effect.succeed([]);
  }

  getCwd(): Effect.Effect<string, never> {
    return Effect.succeed("/tmp");
  }

  resolvePath(path: string): string {
    return path;
  }
}

class MockPathService implements PathService {
  readonly homeDir = "/custom/home";
  readonly baseSearchPath = "/custom/home/src";
  readonly devDir = "/custom/home/.dev";
  readonly configDir = "/custom/home/.config/dev";
  readonly configPath = "/custom/home/.config/dev/config.json";
  readonly dataDir = "/custom/home/.local/share/dev";
  readonly dbPath = "/custom/home/.local/share/dev/dev.db";
  readonly cacheDir = "/custom/home/.cache/dev";

  getBasePath(_config: Config): string {
    return this.baseSearchPath;
  }
}

const makeSubject = () => {
  const shell = new MockShell();
  const fileSystem = new MockFileSystem();
  const pathService = new MockPathService();
  const gcloudTools = makeGcloudToolsLive(shell, fileSystem, pathService);
  const configDir = path.join(pathService.homeDir, ".config", "gcloud");

  return {
    fileSystem,
    gcloudTools,
    configDir,
  };
};

describe("gcloud-tools-live", () => {
  it.effect("setupConfig uses pathService home directory for gcloud config path", () =>
    Effect.gen(function* () {
      const { fileSystem, gcloudTools, configDir } = makeSubject();

      yield* gcloudTools.setupConfig();

      expect(fileSystem.existsCalls).toContain(configDir);
      expect(fileSystem.mkdirCalls).toEqual([{ path: configDir, recursive: true }]);
    }),
  );

  it.effect("setupConfig skips mkdir when config directory already exists", () =>
    Effect.gen(function* () {
      const { fileSystem, gcloudTools, configDir } = makeSubject();
      fileSystem.existingPaths.add(configDir);

      yield* gcloudTools.setupConfig();

      expect(fileSystem.existsCalls).toContain(configDir);
      expect(fileSystem.mkdirCalls).toHaveLength(0);
    }),
  );
});
