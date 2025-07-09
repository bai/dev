import { describe, expect, it } from "vitest";

import type { Config } from "./schema";
import { extractDynamicValues } from "./bootstrap";

describe("bootstrap", () => {
  describe("extractDynamicValues", () => {
    it("always defaults to github provider regardless of defaultOrg mapping", () => {
      const config: Config = {
        version: 3,
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
        version: 3,
        configUrl: "https://example.com/config.json",
        defaultOrg: "myorg",
        telemetry: { enabled: true },
      };

      const result = extractDynamicValues(config);

      expect(result.defaultProvider).toBe("github");
    });

    it("preserves orgToProvider mapping for dynamic provider selection", () => {
      const config: Config = {
        version: 3,
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
        version: 3,
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
        version: 3,
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
  });
});