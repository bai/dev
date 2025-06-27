import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecoverableError, UserInputError } from "./errors";
import { ExitCode } from "./exit-code";
import { handleFatal } from "./handle-error";

// Mock process.exit to prevent actual exits during tests
const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
  throw new Error("process.exit called");
});

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  success: vi.fn(),
  child: vi.fn(),
};

describe("handle-error", () => {
  beforeEach(() => {
    mockExit.mockClear();
    Object.values(mockLogger).forEach((fn) => fn.mockClear());
  });

  describe("handleFatal", () => {
    it("handles CLI errors correctly", async () => {
      const error = new UserInputError("invalid input", { command: "test" });

      await expect(handleFatal(error, mockLogger)).rejects.toThrow("process.exit called");

      expect(mockLogger.error).toHaveBeenCalledWith("❌ invalid input");
      expect(mockExit).toHaveBeenCalledWith(ExitCode.BadInput);
    });

    it("handles unexpected errors", async () => {
      const error = new Error("unexpected error");

      await expect(handleFatal(error, mockLogger)).rejects.toThrow("process.exit called");

      expect(mockLogger.error).toHaveBeenCalledWith("💥 Unexpected error", error);
      expect(mockExit).toHaveBeenCalledWith(ExitCode.Unexpected);
    });

    it("attempts recovery for recoverable errors", async () => {
      class TestRecoverableError extends RecoverableError {
        readonly exitCode = ExitCode.Generic;
        recoverCalled = false;

        async recover() {
          this.recoverCalled = true;
        }
      }

      const error = new TestRecoverableError("recoverable error");

      await expect(handleFatal(error, mockLogger)).rejects.toThrow("process.exit called");

      expect(error.recoverCalled).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith("❌ recoverable error");
      expect(mockExit).toHaveBeenCalledWith(ExitCode.Generic);
    });

    it("handles recovery failure", async () => {
      class TestRecoverableError extends RecoverableError {
        readonly exitCode = ExitCode.Generic;

        async recover() {
          throw new Error("recovery failed");
        }
      }

      const error = new TestRecoverableError("recoverable error");

      await expect(handleFatal(error, mockLogger)).rejects.toThrow("process.exit called");

      expect(mockLogger.error).toHaveBeenCalledWith("❌ recoverable error");
      expect(mockExit).toHaveBeenCalledWith(ExitCode.Generic);
    });

    it("skips recovery when disabled", async () => {
      class TestRecoverableError extends RecoverableError {
        readonly exitCode = ExitCode.Generic;
        recoverCalled = false;

        async recover() {
          this.recoverCalled = true;
        }
      }

      const error = new TestRecoverableError("recoverable error");

      await expect(handleFatal(error, mockLogger, { enableRecovery: false })).rejects.toThrow("process.exit called");

      expect(error.recoverCalled).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith("❌ recoverable error");
      expect(mockExit).toHaveBeenCalledWith(ExitCode.Generic);
    });
  });
});
