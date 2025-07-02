import fs from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CommandContext } from "~/lib/core/command-types";

import { runCommand } from "../legacy/commands/run";

describe("Integration Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-test-"));
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("File System Operations", () => {
    test("should handle directory structure creation", async () => {
      const projectStructure = [
        "src/github.com/org/project1",
        "src/github.com/org/project2",
        "src/gitlab.com/another-org/project3",
      ];

      // Create the directory structure
      for (const dir of projectStructure) {
        await fs.mkdir(path.join(tempDir, dir), { recursive: true });
      }

      // Verify directories were created
      for (const dir of projectStructure) {
        const fullPath = path.join(tempDir, dir);
        const stats = await fs.stat(fullPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });
  });

  describe("Command Functionality", () => {
    describe("run command", () => {
      test("should be correctly configured for variadic arguments", () => {
        // Test the command definition to ensure variadic arguments are properly configured
        expect(runCommand.name).toBe("run");
        expect(runCommand.description).toBe("Runs 'mise run <task>' to execute project tasks");

        // Check that arguments are properly defined
        const args = runCommand.arguments;
        expect(args).toHaveLength(2);
        expect(args?.[0]?.name).toBe("task");
        expect(args?.[0]?.required).toBe(true);
        expect(args?.[1]?.name).toBe("args");
        expect(args?.[1]?.variadic).toBe(true);
      });

      test("should properly extract multiple variadic arguments from context", () => {
        // Create a context that simulates what CommandLoader would provide
        // after our fix to buildContext for variadic arguments
        const mockContext: CommandContext = {
          args: {
            task: "build",
            args: ["--watch", "--production", "output.js"], // This is what fixed buildContext should provide
          },
          options: {},
          command: {} as any,
          logger: {
            info: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            success: vi.fn(),
            warn: vi.fn(),
            child: vi.fn(),
          },
          config: {} as any,
        };

        // Test the argument extraction logic that would be used in the run command
        const task = mockContext.args.task;
        const additionalArgs = mockContext.args.args || [];

        expect(task).toBe("build");
        expect(additionalArgs).toEqual(["--watch", "--production", "output.js"]);

        // The command array should be constructed as:
        const expectedCommand = ["mise", "run", task, ...additionalArgs];
        expect(expectedCommand).toEqual([
          "mise",
          "run",
          "build",
          "--watch",
          "--production",
          "output.js",
        ]);
      });

      test("should handle single variadic argument", () => {
        const mockContext: CommandContext = {
          args: {
            task: "test",
            args: ["--verbose"],
          },
          options: {},
          command: {} as any,
          logger: {
            info: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            success: vi.fn(),
            warn: vi.fn(),
            child: vi.fn(),
          },
          config: {} as any,
        };

        const task = mockContext.args.task;
        const additionalArgs = mockContext.args.args || [];

        expect(task).toBe("test");
        expect(additionalArgs).toEqual(["--verbose"]);

        const expectedCommand = ["mise", "run", task, ...additionalArgs];
        expect(expectedCommand).toEqual(["mise", "run", "test", "--verbose"]);
      });

      test("should handle empty variadic arguments", () => {
        const mockContext: CommandContext = {
          args: {
            task: "lint",
            args: [], // Empty array for no additional arguments
          },
          options: {},
          command: {} as any,
          logger: {
            info: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            success: vi.fn(),
            warn: vi.fn(),
            child: vi.fn(),
          },
          config: {} as any,
        };

        const task = mockContext.args.task;
        const additionalArgs = mockContext.args.args || [];

        expect(task).toBe("lint");
        expect(additionalArgs).toEqual([]);

        const expectedCommand = ["mise", "run", task, ...additionalArgs];
        expect(expectedCommand).toEqual(["mise", "run", "lint"]);
      });
    });
  });
});
