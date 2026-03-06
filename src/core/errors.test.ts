import { describe, expect, it } from "vitest";

import {
  CliUsageError,
  ConfigError,
  ExternalToolError,
  GitError,
  UnknownError,
  cliUsageError,
  configError,
  externalToolError,
  gitError,
  unknownError,
} from "~/core/errors";

describe("errors", () => {
  describe("class-based messages", () => {
    it("uses message as the primary error text for string-based domain errors", () => {
      const error = configError("Configuration file not found");

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe("Configuration file not found");
      expect(error.exitCode).toBe(1);
    });

    it("preserves tag and message for GitError", () => {
      const error = gitError("Git operation failed");

      expect(error._tag).toBe("GitError");
      expect(error.message).toBe("Git operation failed");
      expect(error.exitCode).toBe(1);
    });

    it("formats UnknownError from non-string details while preserving the details payload", () => {
      const details = { complex: "object" };
      const error = unknownError(details);

      expect(error._tag).toBe("UnknownError");
      expect(error.message).toBe('{"complex":"object"}');
      expect(error.details).toEqual(details);
      expect(error.exitCode).toBe(1);
    });

    it("allows UnknownError callers to override the displayed message", () => {
      const error = unknownError({ complex: "object" }, { message: "Fallback failed" });

      expect(error.message).toBe("Fallback failed");
      expect(error.details).toEqual({ complex: "object" });
    });
  });

  describe("structured payload fields", () => {
    it("keeps tool exit metadata separate from the program exit code", () => {
      const error = externalToolError("bun install failed", {
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
      const error = cliUsageError("Missing required argument", "MissingValue");

      expect(error).toBeInstanceOf(CliUsageError);
      expect(error.message).toBe("Missing required argument");
      expect(error.validationTag).toBe("MissingValue");
      expect(error.exitCode).toBe(1);
    });
  });

  describe("direct constructors", () => {
    it("supports direct Schema.TaggedError construction with the new message field", () => {
      const error = new ConfigError({ message: "Test config error" });

      expect(error.message).toBe("Test config error");
    });

    it("supports direct UnknownError construction with explicit details", () => {
      const error = new UnknownError({ message: "Unknown failure", details: { complex: "object" } });

      expect(error.message).toBe("Unknown failure");
      expect(error.details).toEqual({ complex: "object" });
    });

    it("supports direct GitError construction with the new message field", () => {
      const error = new GitError({ message: "Git operation failed" });

      expect(error.message).toBe("Git operation failed");
    });
  });
});
