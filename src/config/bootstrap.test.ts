import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import { extractDynamicValues } from "./bootstrap";
import type { Config } from "./schema";

describe("bootstrap", () => {
  describe("extractDynamicValues", () => {
    it("always defaults to github provider regardless of defaultOrg mapping", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "flywheelsoftware",
        telemetry: { enabled: true },
        orgToProvider: {
          flywheelsoftware: "gitlab",
          someorg: "github",
        },
      };

      const result = extractDynamicValues(config);

      // Should always be github, not influenced by defaultOrg's mapping
      expect(result.defaultProvider).toBe("github");
    });

    it("defaults to github when no orgToProvider mapping exists", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "myorg",
        telemetry: { enabled: true },
      };

      const result = extractDynamicValues(config);

      expect(result.defaultProvider).toBe("github");
    });

    it("preserves orgToProvider mapping for dynamic provider selection", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "myorg",
        telemetry: { enabled: true },
        orgToProvider: {
          gitlab: "gitlab",
          bitbucket: "github", // Bitbucket orgs map to github
          custom: "gitlab",
        },
      };

      const result = extractDynamicValues(config);

      expect(result.orgToProvider).toEqual({
        gitlab: "gitlab",
        bitbucket: "github",
        custom: "gitlab",
      });
    });

    it("handles empty orgToProvider mapping", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "myorg",
        telemetry: { enabled: true },
        orgToProvider: {},
      };

      const result = extractDynamicValues(config);

      expect(result.defaultProvider).toBe("github");
      expect(result.orgToProvider).toEqual({});
    });

    it("extracts all dynamic values correctly", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "acme",
        logLevel: "debug",
        telemetry: { enabled: false },
        orgToProvider: {
          acme: "gitlab",
        },
      };

      const result = extractDynamicValues(config);

      expect(result.defaultOrg).toBe("acme");
      expect(result.logLevel).toBe("debug");
      expect(result.defaultProvider).toBe("github"); // Not affected by acme's mapping
      expect(result.orgToProvider).toEqual({ acme: "gitlab" });
      expect(result.configPath).toContain(".config/dev/config.json");
      expect(result.baseSearchPath).toContain("/src");
    });

    it("expands tilde in baseSearchPath to home directory", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "myorg",
        baseSearchPath: "~/src",
        telemetry: { enabled: true },
      };

      const result = extractDynamicValues(config);

      // Should expand ~ to actual home directory
      expect(result.baseSearchPath).toBe(`${os.homedir()}/src`);
      expect(result.baseSearchPath).not.toContain("~");
    });

    it("preserves absolute paths in baseSearchPath", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "myorg",
        baseSearchPath: "/absolute/path/to/src",
        telemetry: { enabled: true },
      };

      const result = extractDynamicValues(config);

      // Should keep absolute path unchanged
      expect(result.baseSearchPath).toBe("/absolute/path/to/src");
    });

    it("handles complex tilde paths in baseSearchPath", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "myorg",
        baseSearchPath: "~/Documents/Projects",
        telemetry: { enabled: true },
      };

      const result = extractDynamicValues(config);

      // Should expand ~ to home directory
      expect(result.baseSearchPath).toBe(`${os.homedir()}/Documents/Projects`);
      expect(result.baseSearchPath).not.toContain("~");
    });

    it("expands standalone tilde in baseSearchPath", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "myorg",
        baseSearchPath: "~",
        telemetry: { enabled: true },
      };

      const result = extractDynamicValues(config);

      // Should expand standalone ~ to home directory
      expect(result.baseSearchPath).toBe(os.homedir());
    });

    it("resolves relative paths in baseSearchPath", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "myorg",
        baseSearchPath: "./src",
        telemetry: { enabled: true },
      };

      const result = extractDynamicValues(config);

      // Should resolve relative path
      expect(result.baseSearchPath).toBe(path.resolve("./src"));
    });

    it("uses default baseSearchPath when not provided", () => {
      const config: Config = {
        configUrl: "https://example.com/config.json",
        defaultOrg: "myorg",
        telemetry: { enabled: true },
      };

      const result = extractDynamicValues(config);

      // Should default to ~/src expanded
      expect(result.baseSearchPath).toBe(`${os.homedir()}/src`);
    });
  });
});
