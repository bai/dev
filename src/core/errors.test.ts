import { describe, expect, it } from "vitest";

import {
  CliUsageError,
  ConfigError,
  ExternalToolError,
  FileSystemError,
  GitError,
  HealthCheckError,
  NetworkError,
  ShellExecutionError,
  StatusCheckError,
  UnknownError,
} from "~/core/errors";

describe("errors", () => {
  describe("direct constructors", () => {
    it("uses message as the primary error text for string-based domain errors", () => {
      const error = new ConfigError({ message: "Configuration file not found" });

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Configuration file not found");
      expect(error.exitCode).toBe(1);
    });

    it("preserves tag and message for GitError", () => {
      const error = new GitError({ message: "Git operation failed" });

      expect(error._tag).toBe("GitError");
      expect(error.message).toBe("Git operation failed");
      expect(error.exitCode).toBe(1);
    });

    it("supports UnknownError details with an explicit message", () => {
      const error = new UnknownError({ message: "Fallback failed", details: { complex: "object" } });

      expect(error._tag).toBe("UnknownError");
      expect(error.message).toBe("Fallback failed");
      expect(error.details).toEqual({ complex: "object" });
      expect(error.exitCode).toBe(1);
    });

    it("keeps tool exit metadata separate from the program exit code", () => {
      const error = new ExternalToolError({
        message: "bun install failed",
        tool: "bun",
        toolExitCode: 7,
        stderr: "install failed",
      });

      expect(error).toBeInstanceOf(ExternalToolError);
      expect(error.message).toBe("bun install failed");
      expect(error.tool).toBe("bun");
      expect(error.toolExitCode).toBe(7);
      expect(error.exitCode).toBe(1);
    });

    it("maps CLI parser failures to an app-owned error type", () => {
      const error = new CliUsageError({ message: "Missing required argument", validationTag: "MissingValue" });

      expect(error).toBeInstanceOf(CliUsageError);
      expect(error.message).toBe("Missing required argument");
      expect(error.validationTag).toBe("MissingValue");
      expect(error.exitCode).toBe(1);
    });

    it("supports direct UnknownError construction with explicit details", () => {
      const error = new UnknownError({ message: "Unknown failure", details: { complex: "object" } });

      expect(error.message).toBe("Unknown failure");
      expect(error.details).toEqual({ complex: "object" });
    });

    it("supports structured constructor payloads on the remaining error classes", () => {
      const fileSystemError = new FileSystemError({ message: "read failed", path: "/tmp/file" });
      const networkError = new NetworkError({ message: "network down" });
      const healthCheckError = new HealthCheckError({ message: "git failed", tool: "git" });
      const statusCheckError = new StatusCheckError({ message: "bad status", failedComponents: ["git"] });
      const shellExecutionError = new ShellExecutionError({
        command: "git",
        args: ["status"],
        message: "spawn failed",
        cwd: "/tmp/repo",
      });

      expect(fileSystemError.path).toBe("/tmp/file");
      expect(networkError.message).toBe("network down");
      expect(healthCheckError.tool).toBe("git");
      expect(statusCheckError.failedComponents).toEqual(["git"]);
      expect(shellExecutionError.command).toBe("git");
    });
  });
});
