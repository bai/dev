import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

import { makeMiseLive } from "./mise-live";

// Mock implementations
const mockShell = {
  exec: (command: string, args: readonly string[] = [], options?: { cwd?: string }) => {
    // Store the call for assertions
    mockShell.lastCall = { command, args, options };

    // Return different responses based on command
    if (command === "mise" && args[0] === "--version") {
      return Effect.succeed({
        exitCode: 0,
        stdout: "mise 2024.1.0",
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

  execInteractive: (command: string, args: readonly string[] = [], options?: { cwd?: string }) => {
    // Store the call for assertions
    mockShell.lastInteractiveCall = { command, args, options };

    // Simulate successful execution
    return Effect.succeed(0);
  },

  setProcessCwd: () => Effect.succeed(undefined),

  lastCall: undefined as { command: string; args: readonly string[]; options?: { cwd?: string } } | undefined,
  lastInteractiveCall: undefined as
    | { command: string; args: readonly string[]; options?: { cwd?: string } }
    | undefined,
};

const mockFileSystem = {
  exists: () => Effect.succeed(true),
  mkdir: () => Effect.succeed(undefined),
  writeFile: () => Effect.succeed(undefined),
  readFile: () => Effect.succeed("test content"),
  getCwd: () => Effect.succeed("/test/directory"),
  findDirectoriesGlob: () => Effect.succeed([]),
  resolvePath: (path: string) => (path.startsWith("~") ? path.replace("~", "/home/user") : path),
};

const mockConfigLoader = {
  load: () =>
    Effect.succeed({
      configUrl: "https://example.com/config.json",
      defaultOrg: "test-org",
      telemetry: { enabled: false },
      miseGlobalConfig: {
        settings: {
          experimental: true,
        },
      },
    }),
  save: () => Effect.succeed(undefined),
  refresh: () =>
    Effect.succeed({
      configUrl: "https://example.com/config.json",
      defaultOrg: "test-org",
      telemetry: { enabled: false },
      miseGlobalConfig: {
        settings: {
          experimental: true,
        },
      },
    }),
};

describe("mise-live", () => {
  const mise = makeMiseLive(mockShell, mockFileSystem, mockConfigLoader);

  it("runs a task without arguments", async () => {
    await mise.runTask("lint").pipe(Effect.runPromise);

    expect(mockShell.lastInteractiveCall).toEqual({
      command: "mise",
      args: ["run", "lint"],
      options: { cwd: undefined },
    });
  });

  it("runs a task with single argument", async () => {
    await mise.runTask("test", ["--watch"]).pipe(Effect.runPromise);

    expect(mockShell.lastInteractiveCall).toEqual({
      command: "mise",
      args: ["run", "test", "--watch"],
      options: { cwd: undefined },
    });
  });

  it("runs a task with multiple arguments", async () => {
    await mise.runTask("secrets", ["decrypt", "--env", "prod"], "/custom/path").pipe(Effect.runPromise);

    expect(mockShell.lastInteractiveCall).toEqual({
      command: "mise",
      args: ["run", "secrets", "decrypt", "--env", "prod"],
      options: { cwd: "/custom/path" },
    });
  });

  it("runs a task with empty args array", async () => {
    await mise.runTask("build", []).pipe(Effect.runPromise);

    expect(mockShell.lastInteractiveCall).toEqual({
      command: "mise",
      args: ["run", "build"],
      options: { cwd: undefined },
    });
  });

  it("handles task execution failure", async () => {
    const failingShell = {
      ...mockShell,
      execInteractive: () => Effect.succeed(1), // Non-zero exit code
    };

    const failingMise = makeMiseLive(failingShell, mockFileSystem, mockConfigLoader);

    const result = failingMise.runTask("failing-task").pipe(Effect.runPromise);

    await expect(result).rejects.toThrow();
  });

  it("checks installation and parses version correctly", async () => {
    const result = await mise.checkInstallation().pipe(Effect.runPromise);

    expect(result).toEqual({
      version: "2024.1.0",
      runtimeVersions: {
        node: "20.10.0",
        bun: "1.2.17",
      },
    });
  });

  it("gets tasks list correctly", async () => {
    const result = await mise.getTasks().pipe(Effect.runPromise);

    expect(result).toEqual(["lint", "test", "build", "secrets"]);
  });

  it("installs tools with correct arguments", async () => {
    await mise.installTools("/custom/path").pipe(Effect.runPromise);

    expect(mockShell.lastCall).toEqual({
      command: "mise",
      args: ["install"],
      options: { cwd: "/custom/path" },
    });
  });

  it("handles missing cwd parameter correctly", async () => {
    await mise.runTask("test", ["--help"]).pipe(Effect.runPromise);

    expect(mockShell.lastInteractiveCall?.options?.cwd).toBeUndefined();
  });

  it("preserves argument order when running tasks", async () => {
    const args = ["subcommand", "--flag1", "value1", "--flag2", "value2"];
    await mise.runTask("complex-task", args).pipe(Effect.runPromise);

    expect(mockShell.lastInteractiveCall?.args).toEqual([
      "run",
      "complex-task",
      "subcommand",
      "--flag1",
      "value1",
      "--flag2",
      "value2",
    ]);
  });

  it("handles undefined args parameter", async () => {
    await mise.runTask("simple-task", undefined).pipe(Effect.runPromise);

    expect(mockShell.lastInteractiveCall?.args).toEqual(["run", "simple-task"]);
  });
});
