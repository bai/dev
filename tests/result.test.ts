import { describe, expect, it } from "vitest";

import { ExternalToolError, FileSystemError } from "../src/lib/errors";
import { err, ok, tryFs, tryTool, unwrap, type Result } from "../src/lib/result";

describe("result", () => {
  describe("ok", () => {
    it("creates success result", () => {
      const result = ok("success");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("success");
      }
    });
  });

  describe("err", () => {
    it("creates error result", () => {
      const error = new Error("failed");
      const result = err(error);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe("unwrap", () => {
    it("returns value for success result", () => {
      const result = ok("success");
      expect(unwrap(result)).toBe("success");
    });

    it("throws error for failure result", () => {
      const error = new Error("failed");
      const result = err(error);
      expect(() => unwrap(result)).toThrow("failed");
    });
  });

  describe("tryTool", () => {
    it("returns success result for successful function", () => {
      const result = tryTool(() => "success", "test-tool");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("success");
      }
    });

    it("returns error result for failing function", () => {
      const result = tryTool(() => {
        throw new Error("tool failed");
      }, "test-tool");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ExternalToolError);
        expect(result.error.message).toBe("test-tool failed");
        expect(result.error.context.extra?.tool).toBe("test-tool");
      }
    });
  });

  describe("tryFs", () => {
    it("returns success result for successful function", () => {
      const result = tryFs(() => "success", "/test/path");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("success");
      }
    });

    it("returns error result for failing function", () => {
      const result = tryFs(() => {
        throw new Error("fs failed");
      }, "/test/path");
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(FileSystemError);
        expect(result.error.message).toBe("FS error");
        expect(result.error.context.extra?.path).toBe("/test/path");
      }
    });
  });
});
