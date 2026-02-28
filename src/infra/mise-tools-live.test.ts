import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import type { ConfigLoader } from "../domain/config-loader-port";
import type { Config } from "../domain/config-schema";
import { configSchema } from "../domain/config-schema";
import type { FileSystem } from "../domain/file-system-port";
import type { PathService } from "../domain/path-service";
import type { Shell, SpawnResult } from "../domain/shell-port";
import { makeMiseToolsLive } from "./mise-tools-live";

class MockShell implements Shell {
  exec(
    _command: string,
    _args: string[] = [],
    _options?: {
      readonly cwd?: string;
    },
  ): Effect.Effect<SpawnResult, never> {
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
  public readonly writeFileCalls: Array<{ readonly path: string; readonly content: string }> = [];

  readFile(_path: string): Effect.Effect<string, never> {
    return Effect.succeed("");
  }

  writeFile(path: string, content: string): Effect.Effect<void, never> {
    this.writeFileCalls.push({ path, content });
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

const mockConfigLoader: ConfigLoader = {
  load: () =>
    Effect.succeed(
      configSchema.parse({
        miseGlobalConfig: {
          tools: {
            bun: "1.2.17",
          },
        },
      }),
    ),
  save: (_config) => Effect.void,
  refresh: () => Effect.succeed(configSchema.parse({})),
};

const makeSubject = () => {
  const shell = new MockShell();
  const fileSystem = new MockFileSystem();
  const pathService = new MockPathService();
  const miseTools = makeMiseToolsLive(shell, fileSystem, mockConfigLoader, pathService);
  const configDir = path.join(pathService.homeDir, ".config", "mise");
  const configFile = path.join(configDir, "config.toml");

  return {
    fileSystem,
    miseTools,
    configDir,
    configFile,
  };
};

describe("mise-tools-live", () => {
  it.effect("setupGlobalConfig uses pathService home directory for config paths", () =>
    Effect.gen(function* () {
      const { fileSystem, miseTools, configDir, configFile } = makeSubject();

      yield* miseTools.setupGlobalConfig();

      expect(fileSystem.existsCalls).toContain(configDir);
      expect(fileSystem.mkdirCalls).toEqual([{ path: configDir, recursive: true }]);
      expect(fileSystem.writeFileCalls).toHaveLength(1);
      expect(fileSystem.writeFileCalls[0]?.path).toBe(configFile);
      expect(fileSystem.writeFileCalls[0]?.content).toContain("[tools]");
    }),
  );

  it.effect("setupGlobalConfig skips mkdir when config directory already exists", () =>
    Effect.gen(function* () {
      const { fileSystem, miseTools, configDir, configFile } = makeSubject();
      fileSystem.existingPaths.add(configDir);

      yield* miseTools.setupGlobalConfig();

      expect(fileSystem.existsCalls).toContain(configDir);
      expect(fileSystem.mkdirCalls).toHaveLength(0);
      expect(fileSystem.writeFileCalls[0]?.path).toBe(configFile);
    }),
  );
});
