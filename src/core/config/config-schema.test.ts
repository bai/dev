import { describe, expect, it } from "vitest";

import { configSchema } from "~/core/config/config-schema";

describe("config-schema", () => {
  it("defaults telemetry mode to disabled", () => {
    const config = configSchema.parse({});

    expect(config.telemetry.mode).toBe("disabled");
  });

  it("keeps mise config opaque at runtime because config.schema.json delegates validation to mise", () => {
    const config = configSchema.parse({
      miseGlobalConfig: "opaque-value",
      miseRepoConfig: null,
    });

    expect(config.miseGlobalConfig).toBe("opaque-value");
    expect(config.miseRepoConfig).toBeNull();
  });

  it("accepts telemetry mode axiom", () => {
    const result = configSchema.safeParse({
      telemetry: {
        mode: "axiom",
        axiom: {
          endpoint: "https://api.axiom.co/v1/traces",
          apiKey: "xaat-test-key",
          dataset: "devcli",
        },
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects telemetry mode axiom when apiKey is missing", () => {
    const result = configSchema.safeParse({
      telemetry: {
        mode: "axiom",
        axiom: {
          endpoint: "https://api.axiom.co/v1/traces",
          dataset: "devcli",
        },
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects telemetry mode remote", () => {
    const result = configSchema.safeParse({
      telemetry: {
        mode: "remote",
      },
    });

    expect(result.success).toBe(false);
  });
});
