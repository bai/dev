import type { NodeSdk } from "@effect/opentelemetry";
import { Context, Data, type Effect } from "effect";

/**
 * Error types for tracing
 */
export class TracingError extends Data.TaggedError("TracingError")<{
  readonly reason: string;
}> {}

/**
 * Port for OpenTelemetry telemetry configuration (tracing)
 * This abstracts the telemetry implementation details from the application layer
 */
export interface Tracing {
  /**
   * Creates and returns the NodeSdk configuration for telemetry
   */
  readonly createSdkConfig: () => Effect.Effect<NodeSdk.Configuration, TracingError, any>;
}

export class TracingTag extends Context.Tag("Tracing")<TracingTag, Tracing>() {}
