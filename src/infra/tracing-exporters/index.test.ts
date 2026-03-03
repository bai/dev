import { it } from "@effect/vitest";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { configSchema } from "../../domain/config-schema";
import { tracingExporterFactories } from "./index";

describe("tracing-exporters/index", () => {
  it.effect("routes axiom mode through the exporter registry", () =>
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

      const spanProcessor = yield* tracingExporterFactories[telemetry.mode].createSpanProcessor(telemetry);

      expect(tracingExporterFactories.axiom.mode).toBe("axiom");
      expect(spanProcessor).toBeInstanceOf(BatchSpanProcessor);
    }),
  );
});
