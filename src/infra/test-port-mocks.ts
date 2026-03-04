import { Effect } from "effect";

import type { Config } from "../domain/config-schema";
import { shellExecutionError } from "../domain/errors";
import type { FileSystem } from "../domain/file-system-port";
import type { PathService } from "../domain/path-service";
import type { Shell, SpawnResult } from "../domain/shell-port";

export class MockShell implements Shell {
  public readonly execCalls: Array<{
    readonly command: string;
    readonly args: readonly string[];
    readonly options?: { readonly cwd?: string };
  }> = [];

  public readonly execInteractiveCalls: Array<{
    readonly command: string;
    readonly args: readonly string[];
    readonly options?: { readonly cwd?: string };
  }> = [];

  private readonly execResponses = new Map<string, SpawnResult>();
  private readonly interactiveResponses = new Map<string, number>();
  private readonly execFailures = new Set<string>();

  private key(command: string, args: readonly string[]): string {
    return `${command} ${args.join(" ")}`;
  }

  setExecResponse(command: string, args: readonly string[], response: SpawnResult): void {
    this.execResponses.set(this.key(command, args), response);
  }

  setExecFailure(command: string, args: readonly string[]): void {
    this.execFailures.add(this.key(command, args));
  }

  setExecInteractiveResponse(command: string, args: readonly string[], exitCode: number): void {
    this.interactiveResponses.set(this.key(command, args), exitCode);
  }

  exec(
    command: string,
    args: string[] = [],
    options?: {
      readonly cwd?: string;
    },
  ): Effect.Effect<SpawnResult, never> {
    this.execCalls.push({ command, args, options });
    const key = this.key(command, args);

    if (this.execFailures.has(key)) {
      return Effect.fail(shellExecutionError(command, args, "Command execution failed")) as never;
    }

    const response = this.execResponses.get(key);
    if (response) {
      return Effect.succeed(response);
    }

    return Effect.succeed({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  }

  execInteractive(
    command: string,
    args: string[] = [],
    options?: {
      readonly cwd?: string;
    },
  ): Effect.Effect<number, never> {
    this.execInteractiveCalls.push({ command, args, options });
    return Effect.succeed(this.interactiveResponses.get(this.key(command, args)) ?? 0);
  }

  setProcessCwd(_path: string): Effect.Effect<void> {
    return Effect.void;
  }
}

export class MockFileSystem implements FileSystem {
  public readonly existingPaths = new Set<string>();
  public readonly existsCalls: string[] = [];
  public readonly mkdirCalls: Array<{ readonly path: string; readonly recursive?: boolean }> = [];
  public readonly writeFileCalls: Array<{ readonly path: string; readonly content: string }> = [];

  readFile(_path: string): Effect.Effect<string, never> {
    return Effect.succeed("");
  }

  writeFile(path: string, content: string): Effect.Effect<void, never> {
    this.writeFileCalls.push({ path, content });
    this.existingPaths.add(path);
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

export const makePathService = (
  overrides: {
    readonly homeDir?: string;
    readonly baseSearchPath?: string;
    readonly devDir?: string;
    readonly configDir?: string;
    readonly configPath?: string;
    readonly dataDir?: string;
    readonly dbPath?: string;
    readonly cacheDir?: string;
  } = {},
): PathService => {
  const homeDir = overrides.homeDir ?? "/home/user";
  const baseSearchPath = overrides.baseSearchPath ?? `${homeDir}/src`;
  const devDir = overrides.devDir ?? `${homeDir}/.dev`;
  const configDir = overrides.configDir ?? `${homeDir}/.config/dev`;
  const configPath = overrides.configPath ?? `${configDir}/config.json`;
  const dataDir = overrides.dataDir ?? `${homeDir}/.local/share/dev`;
  const dbPath = overrides.dbPath ?? `${dataDir}/dev.db`;
  const cacheDir = overrides.cacheDir ?? `${homeDir}/.cache/dev`;

  return {
    homeDir,
    baseSearchPath,
    devDir,
    configDir,
    configPath,
    dataDir,
    dbPath,
    cacheDir,
    getBasePath: (_config: Config) => baseSearchPath,
  };
};
