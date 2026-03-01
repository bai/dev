import { it } from "@effect/vitest";
import { Effect, Exit } from "effect";
import { beforeEach, describe, expect } from "vitest";

import type { ConfigLoader } from "../domain/config-loader-port";
import type { Config } from "../domain/config-schema";
import { configSchema } from "../domain/config-schema";
import type { FileSystem } from "../domain/file-system-port";
import type { PathService } from "../domain/path-service";
import type { Shell } from "../domain/shell-port";
import { makeMiseLive } from "./mise-live";

// Mock implementations
const mockShell: Shell & {
  lastCall: { command: string; args: readonly string[]; options?: { cwd?: string } } | undefined;
  lastInteractiveCall: { command: string; args: readonly string[]; options?: { cwd?: string } } | undefined;
} = {
  exec: (command: string, args: string[] = [], options?: { cwd?: string }) => {
    // Store the call for assertions
    mockShell.lastCall = { command, args, options };

    // Return different responses based on command
    if (command === "mise" && args[0] === "--version") {
      return Effect.succeed({
        exitCode: 0,
        stdout: "2024.1.0 macos-arm64 (2024-01-01)",
        stderr: "",
      });
    }

    if (command === "mise" && args[0] === "current") {
      return Effect.succeed({
        exitCode: 0,
        stdout: "node 20.10.0\nbun 1.2.17\n",
        stderr: "",
      });
    }

    if (command === "mise" && args[0] === "tasks" && args[1] === "--list") {
      return Effect.succeed({
        exitCode: 0,
        stdout: "lint\ntest\nbuild\nsecrets\n",
        stderr: "",
      });
    }

    return Effect.succeed({
      exitCode: 0,
      stdout: "",
      stderr: "",
    });
  },

  execInteractive: (command: string, args: string[] = [], options?: { cwd?: string }) => {
    // Store the call for assertions
    mockShell.lastInteractiveCall = { command, args, options };

    // Simulate successful execution
    return Effect.succeed(0);
  },

  setProcessCwd: () => Effect.void,

  lastCall: undefined as { command: string; args: readonly string[]; options?: { cwd?: string } } | undefined,
  lastInteractiveCall: undefined as
    | { command: string; args: readonly string[]; options?: { cwd?: string } }
    | undefined,
};

const mockFileSystem = {
  exists: (_path) => Effect.succeed(true),
  mkdir: (_path, _recursive) => Effect.void,
  writeFile: (_path, _content) => Effect.void,
  readFile: (_path) => Effect.succeed("test content"),
  getCwd: () => Effect.succeed("/test/directory"),
  findDirectoriesGlob: (_basePath, _pattern) => Effect.succeed([]),
  resolvePath: (path: string) => (path.startsWith("~") ? path.replace("~", "/home/user") : path),
} satisfies FileSystem;

const mockConfigLoader: ConfigLoader = {
  load: () =>
    Effect.succeed(
      configSchema.parse({
        configUrl: "https://example.com/config.json",
        defaultOrg: "test-org",
        telemetry: { mode: "disabled" },
        miseGlobalConfig: {
          settings: {
            experimental: true,
          },
        },
      }),
    ),
  save: () => Effect.void,
  refresh: () =>
    Effect.succeed(
      configSchema.parse({
        configUrl: "https://example.com/config.json",
        defaultOrg: "test-org",
        telemetry: { mode: "disabled" },
        miseGlobalConfig: {
          settings: {
            experimental: true,
          },
        },
      }),
    ),
};

const mockPathService: PathService = {
  homeDir: "/home/user",
  baseSearchPath: "/home/user/src",
  devDir: "/home/user/.dev",
  configDir: "/home/user/.config/dev",
  configPath: "/home/user/.config/dev/config.json",
  dataDir: "/home/user/.local/share/dev",
  dbPath: "/home/user/.local/share/dev/dev.db",
  cacheDir: "/home/user/.cache/dev",
  getBasePath: (_config: Config): string => "/home/user/src",
};

describe("mise-live", () => {
  const mise = makeMiseLive(mockShell, mockFileSystem, mockConfigLoader, mockPathService);

  beforeEach(() => {
    mockShell.lastCall = undefined;
    mockShell.lastInteractiveCall = undefined;
  });

  it.effect("runs a task without arguments", () =>
    Effect.gen(function* () {
      yield* mise.runTask("lint");

      expect(mockShell.lastInteractiveCall).toEqual({
        command: "mise",
        args: ["run", "lint"],
        options: { cwd: undefined },
      });
    }),
  );

  it.effect("runs a task with single argument", () =>
    Effect.gen(function* () {
      yield* mise.runTask("test", ["--watch"]);

      expect(mockShell.lastInteractiveCall).toEqual({
        command: "mise",
        args: ["run", "test", "--watch"],
        options: { cwd: undefined },
      });
    }),
  );

  it.effect("runs a task with multiple arguments", () =>
    Effect.gen(function* () {
      yield* mise.runTask("secrets", ["decrypt", "--env", "prod"], "/custom/path");

      expect(mockShell.lastInteractiveCall).toEqual({
        command: "mise",
        args: ["run", "secrets", "decrypt", "--env", "prod"],
        options: { cwd: "/custom/path" },
      });
    }),
  );

  it.effect("runs a task with empty args array", () =>
    Effect.gen(function* () {
      yield* mise.runTask("build", []);

      expect(mockShell.lastInteractiveCall).toEqual({
        command: "mise",
        args: ["run", "build"],
        options: { cwd: undefined },
      });
    }),
  );

  it.effect("handles task execution failure", () =>
    Effect.gen(function* () {
      const failingShell: Shell = {
        ...mockShell,
        execInteractive: () => Effect.succeed(1), // Non-zero exit code
      };

      const failingMise = makeMiseLive(failingShell, mockFileSystem, mockConfigLoader, mockPathService);
      const result = yield* Effect.exit(failingMise.runTask("failing-task"));

      expect(Exit.isFailure(result)).toBe(true);
    }),
  );

  it.effect("checks installation and parses version correctly", () =>
    Effect.gen(function* () {
      const result = yield* mise.checkInstallation();

      expect(result).toEqual({
        version: "2024.1.0",
        runtimeVersions: {
          node: "20.10.0",
          bun: "1.2.17",
        },
      });
    }),
  );

  it.effect("gets tasks list correctly", () =>
    Effect.gen(function* () {
      const result = yield* mise.getTasks();

      expect(result).toEqual(["lint", "test", "build", "secrets"]);
    }),
  );

  it.effect("installs tools with correct arguments", () =>
    Effect.gen(function* () {
      yield* mise.installTools("/custom/path");

      expect(mockShell.lastCall).toEqual({
        command: "mise",
        args: ["install"],
        options: { cwd: "/custom/path" },
      });
    }),
  );

  it.effect("handles missing cwd parameter correctly", () =>
    Effect.gen(function* () {
      yield* mise.runTask("test", ["--help"]);

      expect(mockShell.lastInteractiveCall?.options?.cwd).toBeUndefined();
    }),
  );

  it.effect("preserves argument order when running tasks", () =>
    Effect.gen(function* () {
      const args = ["subcommand", "--flag1", "value1", "--flag2", "value2"];
      yield* mise.runTask("complex-task", args);

      expect(mockShell.lastInteractiveCall?.args).toEqual([
        "run",
        "complex-task",
        "subcommand",
        "--flag1",
        "value1",
        "--flag2",
        "value2",
      ]);
    }),
  );

  it.effect("handles undefined args parameter", () =>
    Effect.gen(function* () {
      yield* mise.runTask("simple-task", undefined);

      expect(mockShell.lastInteractiveCall?.args).toEqual(["run", "simple-task"]);
    }),
  );
});
