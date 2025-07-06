import { NodeSdk } from "@effect/opentelemetry";
import { BatchSpanProcessor, ConsoleSpanExporter, NoopSpanProcessor } from "@opentelemetry/sdk-trace-base";

/**
 * Creates a tracing layer that outputs spans to console
 * This follows Effect.ts best practices for tracing configuration
 *
 * Use Effect.withSpan(name) to create spans
 * Use Effect.annotateCurrentSpan(key, value) to add annotations
 * Use Effect.tap(() => Effect.annotateCurrentSpan(key, value)) for pipeline annotations
 */
export const TracingLive = NodeSdk.layer(() => ({
  resource: {
    serviceName: "dev-cli",
    serviceVersion: "0.0.1",
  },
  spanProcessor:
    process.env.NODE_ENV === "development"
      ? new BatchSpanProcessor(new ConsoleSpanExporter())
      : new NoopSpanProcessor(),
}));
