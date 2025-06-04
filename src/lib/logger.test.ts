import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "~/lib/logger";

describe("Logger", () => {
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DEBUG;
  });

  describe("default logger", () => {
    it("should have info/warn/error/success methods", () => {
      logger.info("test info", "arg1");
      logger.warn("test warn", "arg1");
      logger.error("test error", "arg1");
      logger.success("test success", "arg1");

      expect(consoleLogSpy).toHaveBeenCalledWith("test info", "arg1");
      expect(consoleLogSpy).toHaveBeenCalledWith("test success", "arg1");
      expect(consoleWarnSpy).toHaveBeenCalledWith("test warn", "arg1");
      expect(consoleErrorSpy).toHaveBeenCalledWith("test error", "arg1");
    });

    it("should show debug messages when DEBUG env var is set", () => {
      process.env.DEBUG = "true";

      logger.debug("test debug", "arg1");

      expect(consoleLogSpy).toHaveBeenCalledWith("test debug", "arg1");
    });

    it("should not show debug messages when DEBUG env var is not set", () => {
      delete process.env.DEBUG;

      logger.debug("test debug");

      expect(consoleLogSpy).not.toHaveBeenCalledWith("test debug");
    });
  });

  describe("child logger", () => {
    it("should create a child logger with prefix", () => {
      const childLogger = logger.child("CHILD");

      childLogger.info("test message");
      childLogger.warn("test warn");
      childLogger.error("test error");
      childLogger.success("test success");

      expect(consoleLogSpy).toHaveBeenCalledWith("[CHILD] test message");
      expect(consoleLogSpy).toHaveBeenCalledWith("[CHILD] test success");
      expect(consoleWarnSpy).toHaveBeenCalledWith("[CHILD] test warn");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[CHILD] test error");
    });

    it("should create nested child loggers with combined prefixes", () => {
      const childLogger = logger.child("PARENT");
      const nestedChild = childLogger.child("CHILD");

      nestedChild.info("test message");

      expect(consoleLogSpy).toHaveBeenCalledWith("[PARENT:CHILD] test message");
    });

    it("should inherit debug settings from parent logger", () => {
      process.env.DEBUG = "true";
      const childLogger = logger.child("CHILD");

      childLogger.debug("test debug");

      expect(consoleLogSpy).toHaveBeenCalledWith("[CHILD] test debug");
    });

    it("should create multiple levels of nested child loggers", () => {
      const child1 = logger.child("LEVEL1");
      const child2 = child1.child("LEVEL2");
      const child3 = child2.child("LEVEL3");

      child3.info("nested message");

      expect(consoleLogSpy).toHaveBeenCalledWith("[LEVEL1:LEVEL2:LEVEL3] nested message");
    });

    it("should handle debug messages in child loggers when DEBUG is not set", () => {
      delete process.env.DEBUG;
      const childLogger = logger.child("CHILD");

      childLogger.debug("test debug");

      expect(consoleLogSpy).not.toHaveBeenCalledWith("[CHILD] test debug");
    });
  });
});
