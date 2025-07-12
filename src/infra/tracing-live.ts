import type { NodeSdk } from "@effect/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor, ConsoleSpanExporter, NoopSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Effect, Layer } from "effect";

import { ConfigLoaderTag } from "../domain/config-loader-port";
import { ShellTag } from "../domain/shell-port";
import { TracingError, TracingTag, type Tracing } from "../domain/tracing-port";

/**
 * Creates a Google Cloud Trace OTLP exporter with proper authentication
 */
const createGoogleCloudTraceExporter = (
  projectId: string,
  shell: typeof ShellTag.Service,
): Effect.Effect<BatchSpanProcessor, TracingError, never> =>
  Effect.gen(function* () {
    // Get access token using shell service
    const result = yield* shell
      .exec("gcloud", ["auth", "print-access-token", `--billing-project=${projectId}`, "--quiet"])
      .pipe(
        Effect.timeout("10 seconds"),
        Effect.catchTag("TimeoutException", () =>
          Effect.fail(new TracingError({ reason: "gcloud auth command timed out" })),
        ),
        Effect.catchAll((error) =>
          Effect.fail(new TracingError({ reason: `Failed to get access token: ${error.message}` })),
        ),
      );

    const token = result.stdout.trim();

    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Goog-User-Project": projectId,
    } as const;

    const exporter = new OTLPTraceExporter({
      url: "https://telemetry.googleapis.com/v1/traces",
      headers,
    });

    return new BatchSpanProcessor(exporter);
  }).pipe(
    Effect.catchAll((error) => {
      console.warn("Failed to initialize Google Cloud Trace exporter, falling back to console:", error.reason);
      return Effect.succeed(new BatchSpanProcessor(new ConsoleSpanExporter()));
    }),
  );

/**
 * Factory function that creates a Tracing implementation
 */
const makeTracingLive = (configLoader: typeof ConfigLoaderTag.Service, shell: typeof ShellTag.Service): Tracing => ({
  createSdkConfig: () =>
    Effect.gen(function* () {
      const appConfig = yield* configLoader
        .load()
        .pipe(
          Effect.catchAll((error) => Effect.fail(new TracingError({ reason: `Failed to load config: ${error._tag}` }))),
        );
      const telemetryConfig = appConfig.telemetry;
      // TODO: Get version from a domain service or environment variable
      const version = process.env.CLI_VERSION || "0.0.1";

      // Determine span processor based on configuration
      let spanProcessor: NodeSdk.Configuration["spanProcessor"] = new NoopSpanProcessor();

      // Apply telemetry configuration if available
      if (telemetryConfig.enabled && telemetryConfig.mode) {
        switch (telemetryConfig.mode) {
          case "console":
            spanProcessor = new BatchSpanProcessor(new ConsoleSpanExporter());
            break;

          case "google": {
            const projectId = telemetryConfig.projectId || "devcli-465111";
            spanProcessor = yield* createGoogleCloudTraceExporter(projectId, shell);
            break;
          }

          case "disabled":
          default:
            // Keep the NoopSpanProcessor
            break;
        }
      }

      // Return immutable configuration
      const sdkConfig: NodeSdk.Configuration = {
        resource: {
          serviceName: "dev-cli",
          serviceVersion: version,
        },
        spanProcessor,
      };

      return sdkConfig;
    }),
});

/**
 * Layer that provides a live Tracing implementation
 */
export const TracingLiveLayer = Layer.effect(
  TracingTag,
  Effect.gen(function* () {
    const configLoader = yield* ConfigLoaderTag;
    const shell = yield* ShellTag;
    return makeTracingLive(configLoader, shell);
  }),
);
