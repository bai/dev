import type { NodeSdk } from "@effect/opentelemetry";
import { Effect, Schema } from "effect";

/**
 * Error types for tracing
 */
export class TracingError extends Schema.TaggedError<TracingError>()("TracingError", {
  message: Schema.String,
}) {
  get exitCode(): number {
    return 1;
  }
}

/**
 * Port for OpenTelemetry telemetry configuration (tracing)
 * This abstracts the telemetry implementation details from the application layer
 */
export class TracingTag extends Effect.Tag("Tracing")<
  TracingTag,
  {
    /**
     * Creates and returns the NodeSdk configuration for telemetry
     */
    readonly createSdkConfig: () => Effect.Effect<NodeSdk.Configuration, TracingError>;
  }
>() {}

export type Tracing = (typeof TracingTag)["Service"];
