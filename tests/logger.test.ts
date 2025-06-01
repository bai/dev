import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDebugLogger, createLogger, createPrefixedLogger } from "~/lib/logger";

describe("Functional Logger", () => {
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

  describe("createLogger", () => {
    it("should create a basic logger with info/warn/error/success methods", () => {
      const logger = createLogger();

      logger.info("test info", "arg1");
      logger.warn("test warn", "arg1");
      logger.error("test error", "arg1");
      logger.success("test success", "arg1");

      expect(consoleLogSpy).toHaveBeenCalledWith("test info", "arg1");
      expect(consoleLogSpy).toHaveBeenCalledWith("test success", "arg1");
      expect(consoleWarnSpy).toHaveBeenCalledWith("test warn", "arg1");
      expect(consoleErrorSpy).toHaveBeenCalledWith("test error", "arg1");
    });

    it("should not show debug messages by default", () => {
      const logger = createLogger();

      logger.debug("test debug");

      expect(consoleLogSpy).not.toHaveBeenCalledWith("test debug");
    });

    it("should show debug messages when debugEnabled is true", () => {
      const logger = createLogger(true);

      logger.debug("test debug", "arg1");

      expect(consoleLogSpy).toHaveBeenCalledWith("test debug", "arg1");
    });

    it("should show debug messages when DEBUG env var is set", () => {
      process.env.DEBUG = "true";
      const logger = createLogger();

      logger.debug("test debug", "arg1");

      expect(consoleLogSpy).toHaveBeenCalledWith("test debug", "arg1");
    });
  });

  describe("createDebugLogger", () => {
    it("should create a logger with debug enabled by default", () => {
      const logger = createDebugLogger();

      logger.debug("test debug", "arg1");

      expect(consoleLogSpy).toHaveBeenCalledWith("test debug", "arg1");
    });
  });

  describe("createPrefixedLogger", () => {
    it("should create a logger with a prefix", () => {
      const logger = createPrefixedLogger("PREFIX");

      logger.info("test message");
      logger.warn("test warn");
      logger.error("test error");
      logger.success("test success");

      expect(consoleLogSpy).toHaveBeenCalledWith("[PREFIX] test message");
      expect(consoleLogSpy).toHaveBeenCalledWith("[PREFIX] test success");
      expect(consoleWarnSpy).toHaveBeenCalledWith("[PREFIX] test warn");
      expect(consoleErrorSpy).toHaveBeenCalledWith("[PREFIX] test error");
    });

    it("should create a prefixed logger with debug enabled", () => {
      const logger = createPrefixedLogger("PREFIX", true);

      logger.debug("test debug");

      expect(consoleLogSpy).toHaveBeenCalledWith("[PREFIX] test debug");
    });
  });

  describe("child logger", () => {
    it("should create a child logger with additional prefix", () => {
      const logger = createLogger();
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
      const logger = createPrefixedLogger("PARENT");
      const childLogger = logger.child("CHILD");

      childLogger.info("test message");

      expect(consoleLogSpy).toHaveBeenCalledWith("[PARENT:CHILD] test message");
    });

    it("should inherit debug settings from parent logger", () => {
      const logger = createLogger(true);
      const childLogger = logger.child("CHILD");

      childLogger.debug("test debug");

      expect(consoleLogSpy).toHaveBeenCalledWith("[CHILD] test debug");
    });

    it("should create multiple levels of nested child loggers", () => {
      const logger = createLogger();
      const child1 = logger.child("LEVEL1");
      const child2 = child1.child("LEVEL2");

      child2.info("nested message");

      expect(consoleLogSpy).toHaveBeenCalledWith("[LEVEL1:LEVEL2] nested message");
    });
  });
});
