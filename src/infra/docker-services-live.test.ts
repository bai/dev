import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import type { Config } from "../domain/config-schema";
import { shellExecutionError } from "../domain/errors";
import type { FileSystem } from "../domain/file-system-port";
import type { PathService } from "../domain/path-service";
import type { Shell, SpawnResult } from "../domain/shell-port";
import { makeDockerServicesLive } from "./docker-services-live";

class MockShell implements Shell {
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

  private createKey(command: string, args: readonly string[]): string {
    return `${command} ${args.join(" ")}`;
  }

  setExecResponse(command: string, args: readonly string[], response: SpawnResult): void {
    this.execResponses.set(this.createKey(command, args), response);
  }

  setExecFailure(command: string, args: readonly string[]): void {
    this.execFailures.add(this.createKey(command, args));
  }

  setExecInteractiveResponse(command: string, args: readonly string[], exitCode: number): void {
    this.interactiveResponses.set(this.createKey(command, args), exitCode);
  }

  exec(
    command: string,
    args: string[] = [],
    options?: {
      readonly cwd?: string;
    },
  ): Effect.Effect<SpawnResult, never> {
    this.execCalls.push({ command, args, options });
    const key = this.createKey(command, args);

    if (this.execFailures.has(key)) {
      return shellExecutionError(command, args, "Command execution failed") as never;
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
    const response = this.interactiveResponses.get(this.createKey(command, args));
    return Effect.succeed(response ?? 0);
  }

  setProcessCwd(_path: string): Effect.Effect<void> {
    return Effect.void;
  }
}

class MockFileSystem implements FileSystem {
  public readonly existingPaths = new Set<string>();
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
  readonly homeDir = "/home/user";
  readonly baseSearchPath = "/home/user/src";
  readonly devDir = "/home/user/.dev";
  readonly configDir = "/home/user/.config/dev";
  readonly configPath = "/home/user/.config/dev/config.json";
  readonly dataDir = "/tmp/dev-data";
  readonly dbPath = "/tmp/dev-data/dev.db";
  readonly cacheDir = "/tmp/dev-cache";

  getBasePath(_config: Config): string {
    return this.baseSearchPath;
  }
}

const makeSubject = () => {
  const shell = new MockShell();
  const fileSystem = new MockFileSystem();
  const pathService = new MockPathService();
  const dockerServices = makeDockerServicesLive(shell, fileSystem, pathService);
  const composeFilePath = path.join(pathService.dataDir, "docker", "docker-compose.yml");

  return {
    shell,
    fileSystem,
    dockerServices,
    composeFilePath,
  };
};

describe("docker-services-live", () => {
  it.effect("uses the path service compose location for docker compose up", () =>
    Effect.gen(function* () {
      const { shell, fileSystem, dockerServices, composeFilePath } = makeSubject();
      const composeDir = path.dirname(composeFilePath);

      shell.setExecResponse("docker", ["compose", "-f", composeFilePath, "up", "-d", "postgres17"], {
        exitCode: 0,
        stdout: "",
        stderr: "",
      });

      yield* dockerServices.up(["postgres17"]);

      expect(fileSystem.mkdirCalls).toEqual([{ path: composeDir, recursive: true }]);
      expect(fileSystem.writeFileCalls[0]?.path).toBe(composeFilePath);
      expect(fileSystem.writeFileCalls[0]?.content).toContain("name: dev-services");
      expect(shell.execCalls[0]?.args).toEqual(["compose", "-f", composeFilePath, "up", "-d", "postgres17"]);
    }),
  );

  it.effect("maps non-zero compose execution to DockerServiceError for status", () =>
    Effect.gen(function* () {
      const { shell, fileSystem, dockerServices, composeFilePath } = makeSubject();
      fileSystem.existingPaths.add(composeFilePath);

      shell.setExecResponse("docker", ["compose", "-f", composeFilePath, "ps", "--format", "json", "-a"], {
        exitCode: 1,
        stdout: "",
        stderr: "compose ps failed",
      });

      const error = yield* Effect.flip(dockerServices.status());

      expect(error).toMatchObject({
        _tag: "DockerServiceError",
        reason: "Failed to get service status",
        exitCode: 1,
        stderr: "compose ps failed",
      });
    }),
  );

  it.effect("treats SIGINT (130) from interactive logs as graceful", () =>
    Effect.gen(function* () {
      const { shell, fileSystem, dockerServices, composeFilePath } = makeSubject();
      fileSystem.existingPaths.add(composeFilePath);

      shell.setExecInteractiveResponse(
        "docker",
        ["compose", "-f", composeFilePath, "logs", "-f", "--tail", "20", "valkey"],
        130,
      );

      yield* dockerServices.logs("valkey", { follow: true, tail: 20 });

      expect(shell.execInteractiveCalls[0]?.args).toEqual([
        "compose",
        "-f",
        composeFilePath,
        "logs",
        "-f",
        "--tail",
        "20",
        "valkey",
      ]);
    }),
  );

  it.effect("returns false when docker info command fails", () =>
    Effect.gen(function* () {
      const { shell, dockerServices } = makeSubject();
      shell.setExecFailure("docker", ["info"]);

      const isAvailable = yield* dockerServices.isDockerAvailable();

      expect(isAvailable).toBe(false);
    }),
  );
});
