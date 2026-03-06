import { it } from "@effect/vitest";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { configSchema } from "~/core/config/config-schema";
import { axiomTracingExporterFactory } from "~/core/observability/adapters/axiom-tracing-exporter-live";

describe("axiom-tracing-exporter-live", () => {
  it("exposes the expected exporter mode", () => {
    expect(axiomTracingExporterFactory.mode).toBe("axiom");
  });

  it.effect("creates a BatchSpanProcessor for valid axiom telemetry config", () =>
    Effect.gen(function* () {
      const telemetry = configSchema.parse({
        telemetry: {
          mode: "axiom",
          axiom: {
            endpoint: "https://api.axiom.co/v1/traces",
            apiKey: "xaat-test-key",
            dataset: "devcli",
          },
        },
      }).telemetry;

      expect(telemetry.mode).toBe("axiom");
      if (telemetry.mode !== "axiom") {
        return;
      }

      const spanProcessor = yield* axiomTracingExporterFactory.createSpanProcessor(telemetry);
      expect(spanProcessor).toBeInstanceOf(BatchSpanProcessor);
    }),
  );

  it.effect("returns a new span processor instance per invocation", () =>
    Effect.gen(function* () {
      const telemetry = configSchema.parse({
        telemetry: {
          mode: "axiom",
          axiom: {
            endpoint: "https://api.axiom.co/v1/traces",
            apiKey: "xaat-test-key",
            dataset: "devcli",
          },
        },
      }).telemetry;

      expect(telemetry.mode).toBe("axiom");
      if (telemetry.mode !== "axiom") {
        return;
      }

      const first = yield* axiomTracingExporterFactory.createSpanProcessor(telemetry);
      const second = yield* axiomTracingExporterFactory.createSpanProcessor(telemetry);

      expect(first).toBeInstanceOf(BatchSpanProcessor);
      expect(second).toBeInstanceOf(BatchSpanProcessor);
      expect(first).not.toBe(second);
    }),
  );
});
