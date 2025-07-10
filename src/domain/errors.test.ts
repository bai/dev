import { describe, expect, it } from "vitest";

import { ConfigError, extractErrorMessage, GitError, UnknownError } from "./errors";

describe("errors", () => {
  describe("extractErrorMessage", () => {
    it("extracts message from standard Error objects", () => {
      const error = new Error("Standard error message");
      const result = extractErrorMessage(error);

      expect(result).toBe("Standard error message");
    });

    it("extracts message from objects with message property", () => {
      const error = { message: "Custom error message" };
      const result = extractErrorMessage(error);

      expect(result).toBe("Custom error message");
    });

    it("extracts message from Effect CLI error structure", () => {
      const error = {
        _tag: "InvalidValue",
        error: {
          _tag: "Paragraph",
          value: {
            _tag: "Text",
            value: "Received unknown argument: 'decrypt'",
          },
        },
      };
      const result = extractErrorMessage(error);

      expect(result).toBe("Received unknown argument: 'decrypt'");
    });

    it("handles nested CLI error with complex structure", () => {
      const error = {
        _tag: "ValidationError",
        error: {
          _tag: "Paragraph",
          value: {
            _tag: "Text",
            value: "Invalid command syntax",
          },
        },
      };
      const result = extractErrorMessage(error);

      expect(result).toBe("Invalid command syntax");
    });

    it("falls back to JSON.stringify for unknown object structures", () => {
      const error = {
        _tag: "CustomError",
        details: "Some details",
        code: 42,
      };
      const result = extractErrorMessage(error);

      expect(result).toBe('{"_tag":"CustomError","details":"Some details","code":42}');
    });

    it("handles primitive values", () => {
      expect(extractErrorMessage("string error")).toBe("string error");
      expect(extractErrorMessage(404)).toBe("404");
      expect(extractErrorMessage(true)).toBe("true");
      expect(extractErrorMessage(null)).toBe("null");
      expect(extractErrorMessage(undefined)).toBe("undefined");
    });

    it("handles Effect-TS domain errors", () => {
      const configError = new ConfigError({ reason: "Configuration file not found" });
      const result = extractErrorMessage(configError);

      // ConfigError should be JSON.stringified since it has empty message and _tag
      expect(result).toContain("ConfigError");
      expect(result).toContain("Configuration file not found");
    });

    it("handles objects with non-string message property", () => {
      const error = { message: 123 };
      const result = extractErrorMessage(error);

      expect(result).toBe("123");
    });

    it("handles objects with null message property", () => {
      const error = { message: null };
      const result = extractErrorMessage(error);

      expect(result).toBe("null");
    });

    it("handles incomplete CLI error structure", () => {
      const error = {
        _tag: "InvalidValue",
        error: {
          _tag: "Paragraph",
          // Missing value property
        },
      };
      const result = extractErrorMessage(error);

      expect(result).toContain("InvalidValue");
    });

    it("handles CLI error with missing nested value", () => {
      const error = {
        _tag: "InvalidValue",
        error: {
          _tag: "Paragraph",
          value: {
            _tag: "Text",
            // Missing value property
          },
        },
      };
      const result = extractErrorMessage(error);

      expect(result).toContain("InvalidValue");
    });

    it("handles empty objects", () => {
      const result = extractErrorMessage({});

      expect(result).toBe("{}");
    });

    it("handles arrays", () => {
      const result = extractErrorMessage(["error1", "error2"]);

      expect(result).toBe('["error1","error2"]');
    });

    it("handles circular references safely", () => {
      const error: any = { _tag: "CircularError" };
      error.self = error;

      // JSON.stringify will throw for circular references, but our function catches this
      const result = extractErrorMessage(error);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("prioritizes message property over CLI error structure", () => {
      const error = {
        message: "Direct message",
        _tag: "InvalidValue",
        error: {
          _tag: "Paragraph",
          value: {
            _tag: "Text",
            value: "Nested message",
          },
        },
      };
      const result = extractErrorMessage(error);

      expect(result).toBe("Direct message");
    });

    it("handles Error objects with additional properties", () => {
      const error = new Error("Base message");
      (error as any).code = "ERR_CUSTOM";
      (error as any).details = "Additional details";

      const result = extractErrorMessage(error);

      expect(result).toBe("Base message");
    });
  });

  describe("domain error constructors", () => {
    it("creates ConfigError with correct structure", () => {
      const error = new ConfigError({ reason: "Test config error" });

      expect(error._tag).toBe("ConfigError");
      expect(error.reason).toBe("Test config error");
    });

    it("creates GitError with correct structure", () => {
      const error = new GitError({ reason: "Git operation failed" });

      expect(error._tag).toBe("GitError");
      expect(error.reason).toBe("Git operation failed");
    });

    it("creates UnknownError with any reason type", () => {
      const error = new UnknownError({ reason: { complex: "object" } });

      expect(error._tag).toBe("UnknownError");
      expect(error.reason).toEqual({ complex: "object" });
    });
  });
});
