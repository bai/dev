import { describe, expect, test, vi } from "vitest";

import { buildContext } from "~/lib/core/command-loader";
import { createCommandRegistry } from "~/lib/core/command-registry";
import type { ConfigManager, DevCommand, Logger } from "~/lib/core/command-types";
import { arg } from "~/lib/core/command-utils";

describe("CommandLoader", () => {
  describe("buildContext", () => {
    test("should properly handle variadic arguments", () => {
      // Create mock dependencies
      const mockLogger: Logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
        child: vi.fn(),
      };

      const mockConfig: ConfigManager = {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        getAll: vi.fn(),
      };

      // Create a test command with variadic arguments
      const testCommand: DevCommand = {
        name: "test",
        description: "Test command",
        arguments: [
          arg("task", "Task name", { required: true }),
          arg("args", "Additional arguments", { variadic: true }),
        ],
        exec: vi.fn(),
      };

      // Simulate commander.js args array: [task, [variadic_args], options]
      // Commander.js collects variadic arguments into an array automatically
      const commanderArgs = ["build", ["--watch", "--production", "output.js"], {}];
      const mockCommand = {} as any;

      // Use the functional buildContext directly
      const context = buildContext(testCommand, commanderArgs, mockCommand, mockLogger, mockConfig);

      // Verify that the context has the correct structure
      expect(context.args.task).toBe("build");
      expect(context.args.args).toEqual(["--watch", "--production", "output.js"]);
      expect(context.options).toEqual({});
      expect(context.logger).toBe(mockLogger);
      expect(context.config).toBe(mockConfig);
    });

    test("should handle empty variadic arguments", () => {
      const mockLogger: Logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
        child: vi.fn(),
      };

      const mockConfig: ConfigManager = {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        getAll: vi.fn(),
      };

      const testCommand: DevCommand = {
        name: "test",
        description: "Test command",
        arguments: [
          arg("task", "Task name", { required: true }),
          arg("args", "Additional arguments", { variadic: true }),
        ],
        exec: vi.fn(),
      };

      // Only task provided, no additional args
      // Commander.js provides an empty array for variadic args when none are provided
      const commanderArgs = ["lint", [], {}];
      const mockCommand = {} as any;

      const context = buildContext(testCommand, commanderArgs, mockCommand, mockLogger, mockConfig);

      expect(context.args.task).toBe("lint");
      expect(context.args.args).toEqual([]);
    });

    test("should handle non-variadic arguments correctly", () => {
      const mockLogger: Logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
        child: vi.fn(),
      };

      const mockConfig: ConfigManager = {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        getAll: vi.fn(),
      };

      const testCommand: DevCommand = {
        name: "test",
        description: "Test command",
        arguments: [
          arg("first", "First argument", { required: true }),
          arg("second", "Second argument", { required: false }),
        ],
        exec: vi.fn(),
      };

      const commanderArgs = ["value1", "value2", {}];
      const mockCommand = {} as any;

      const context = buildContext(testCommand, commanderArgs, mockCommand, mockLogger, mockConfig);

      expect(context.args.first).toBe("value1");
      expect(context.args.second).toBe("value2");
    });

    test("should handle mixed non-variadic and variadic arguments", () => {
      const mockLogger: Logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        success: vi.fn(),
        child: vi.fn(),
      };

      const mockConfig: ConfigManager = {
        get: vi.fn(),
        set: vi.fn(),
        has: vi.fn(),
        getAll: vi.fn(),
      };

      const testCommand: DevCommand = {
        name: "test",
        description: "Test command",
        arguments: [
          arg("command", "Command to run", { required: true }),
          arg("target", "Target environment", { required: true }),
          arg("flags", "Additional flags", { variadic: true }),
        ],
        exec: vi.fn(),
      };

      const commanderArgs = ["deploy", "production", ["--force", "--dry-run", "--verbose"], {}];
      const mockCommand = {} as any;

      const context = buildContext(testCommand, commanderArgs, mockCommand, mockLogger, mockConfig);

      expect(context.args.command).toBe("deploy");
      expect(context.args.target).toBe("production");
      expect(context.args.flags).toEqual(["--force", "--dry-run", "--verbose"]);
    });
  });
});
