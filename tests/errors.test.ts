import { describe, expect, it } from "vitest";

import {
  ConfigurationError,
  ExternalToolError,
  FileSystemError,
  isCLIError,
  isRecoverableError,
  RecoverableError,
  UserInputError,
} from "../src/lib/errors";
import { ExitCode } from "../src/lib/exit-code";

describe("errors", () => {
  describe("UserInputError", () => {
    it("creates error with correct exit code", () => {
      const error = new UserInputError("test message");
      expect(error.exitCode).toBe(ExitCode.BadInput);
      expect(error.message).toBe("test message");
      expect(error.name).toBe("UserInputError");
    });

    it("includes context and timestamp", () => {
      const context = { command: "test", extra: { key: "value" } };
      const error = new UserInputError("test message", context);

      expect(error.context).toEqual(context);
      expect(error.timestamp).toBeDefined();
      expect(typeof error.timestamp).toBe("string");
    });

    it("serializes to JSON correctly", () => {
      const error = new UserInputError("test message", { command: "test" });
      const json = error.toJSON();

      expect(json).toEqual({
        name: "UserInputError",
        message: "test message",
        exitCode: ExitCode.BadInput,
        context: { command: "test" },
        timestamp: error.timestamp,
      });
    });
  });

  describe("ExternalToolError", () => {
    it("creates error with correct exit code", () => {
      const error = new ExternalToolError("tool failed");
      expect(error.exitCode).toBe(ExitCode.ExternalTool);
      expect(error.message).toBe("tool failed");
      expect(error.name).toBe("ExternalToolError");
    });
  });

  describe("FileSystemError", () => {
    it("creates error with correct exit code", () => {
      const error = new FileSystemError("fs error");
      expect(error.exitCode).toBe(ExitCode.FileSystem);
      expect(error.message).toBe("fs error");
      expect(error.name).toBe("FileSystemError");
    });
  });

  describe("ConfigurationError", () => {
    it("creates error with correct exit code", () => {
      const error = new ConfigurationError("config error");
      expect(error.exitCode).toBe(ExitCode.Config);
      expect(error.message).toBe("config error");
      expect(error.name).toBe("ConfigurationError");
    });
  });

  describe("RecoverableError", () => {
    class TestRecoverableError extends RecoverableError {
      readonly exitCode = ExitCode.Generic;
      async recover() {
        // Test recovery logic
      }
    }

    it("can be extended for recoverable errors", () => {
      const error = new TestRecoverableError("recoverable error");
      expect(error.exitCode).toBe(ExitCode.Generic);
      expect(error.message).toBe("recoverable error");
      expect(typeof error.recover).toBe("function");
    });
  });

  describe("type guards", () => {
    it("identifies CLI errors correctly", () => {
      const cliError = new UserInputError("test");
      const regularError = new Error("test");

      expect(isCLIError(cliError)).toBe(true);
      expect(isCLIError(regularError)).toBe(false);
      expect(isCLIError(null)).toBe(false);
      expect(isCLIError(undefined)).toBe(false);
      expect(isCLIError("string")).toBe(false);
    });

    it("identifies recoverable errors correctly", () => {
      class TestRecoverableError extends RecoverableError {
        readonly exitCode = ExitCode.Generic;
        recover() {
          // Mock recovery implementation
        }
      }

      const recoverableError = new TestRecoverableError("test");
      const cliError = new UserInputError("test");
      const regularError = new Error("test");

      expect(isRecoverableError(recoverableError)).toBe(true);
      expect(isRecoverableError(cliError)).toBe(false);
      expect(isRecoverableError(regularError)).toBe(false);
    });
  });
});
