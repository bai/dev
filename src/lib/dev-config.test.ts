import { describe, expect, test } from "vitest";

import { clearDevConfigCache, createConfig, createConfigError, devConfigSchema, isConfigError } from "./dev-config";

describe("dev-config", () => {
  describe("devConfigSchema", () => {
    test("validates valid configuration", () => {
      const validConfig = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "test-org",
        orgToProvider: { "test-org": "github" },
      };

      const result = devConfigSchema.safeParse(validConfig);
      expect(result.success).toBe(true);
    });

    test("provides defaults for missing fields", () => {
      const minimalConfig = {};

      const result = devConfigSchema.safeParse(minimalConfig);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.defaultOrg).toBe("bai");
        expect(result.data.orgToProvider).toEqual({ "gitlab-org": "gitlab" });
      }
    });

    test("rejects invalid configuration", () => {
      const invalidConfig = {
        configUrl: "not-a-url",
        defaultOrg: 123,
      };

      const result = devConfigSchema.safeParse(invalidConfig);
      expect(result.success).toBe(false);
    });
  });

  describe("createConfigError", () => {
    test("creates error with correct name and message", () => {
      const error = createConfigError("Test error", new Error("Cause"));

      expect(error.name).toBe("ConfigError");
      expect(error.message).toBe("Test error");
      expect(error.cause).toBeInstanceOf(Error);
    });

    test("works without cause", () => {
      const error = createConfigError("Test error");

      expect(error.name).toBe("ConfigError");
      expect(error.message).toBe("Test error");
      expect(error.cause).toBeUndefined();
    });
  });

  describe("isConfigError", () => {
    test("identifies ConfigError correctly", () => {
      const configError = createConfigError("Test error");
      const regularError = new Error("Regular error");

      expect(isConfigError(configError)).toBe(true);
      expect(isConfigError(regularError)).toBe(false);
    });
  });

  describe("createConfig", () => {
    test("returns ConfigManager with basic functionality", () => {
      const configManager = createConfig();

      expect(configManager.get("defaultOrg")).toBeDefined();
      expect(configManager.has("defaultOrg")).toBe(true);
      expect(configManager.has("nonExistentKey")).toBe(false);
      expect(configManager.getAll()).toBeInstanceOf(Object);
    });

    test("get returns default value for missing keys", () => {
      const configManager = createConfig();

      expect(configManager.get("nonExistentKey", "default")).toBe("default");
      expect(configManager.get("nonExistentKey")).toBeUndefined();
    });

    test("set throws error as expected", () => {
      const configManager = createConfig();

      expect(() => configManager.set("key", "value")).toThrow("Config modification not supported");
    });
  });

  describe("clearDevConfigCache", () => {
    test("function exists and can be called", () => {
      expect(() => clearDevConfigCache()).not.toThrow();
    });
  });
});
