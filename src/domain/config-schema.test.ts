import { describe, expect, it } from "vitest";

import { configSchema } from "./config-schema";

describe("config-schema", () => {
  it("defaults telemetry mode to disabled", () => {
    const config = configSchema.parse({});

    expect(config.telemetry.mode).toBe("disabled");
  });

  it("accepts telemetry mode axiom", () => {
    const result = configSchema.safeParse({
      telemetry: {
        mode: "axiom",
        axiom: {
          endpoint: "https://api.axiom.co/v1/traces",
          dataset: "devcli",
        },
      },
    });

    expect(result.success).toBe(true);
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
