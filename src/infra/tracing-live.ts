import type { NodeSdk } from "@effect/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import * as resources from "@opentelemetry/resources";
import { BatchSpanProcessor, ConsoleSpanExporter, NoopSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { Effect, Layer, Runtime } from "effect";

import { ConfigLoaderTag } from "../domain/config-loader-port";
import { TracingError, TracingTag, type Tracing } from "../domain/tracing-port";
import { VersionTag } from "../domain/version-port";

/**
 * Logs export results from remote trace endpoint
 */
const logExportResult = (result: { code: number; error?: any; spans: number }) =>
  Effect.gen(function* () {
    if (result.code === 0) {
      // Success - no logging needed for normal operation
      return;
    }

    // Handle errors
    if (result.error?.code) {
      yield* Effect.logWarning(
        `Failed to export ${result.spans} spans to remote trace endpoint (HTTP ${result.error.code})`,
      );

      // Parse error response if available
      if (result.error.data) {
        try {
          const errorData = typeof result.error.data === "string" ? JSON.parse(result.error.data) : result.error.data;

          if (errorData.error?.message) {
            yield* Effect.logWarning(`Remote trace endpoint error: ${errorData.error.message}`);
          }

          // Extract activation URL if present
          const details = errorData.error?.details;
          if (Array.isArray(details)) {
            const activationDetail = details.find((d: any) => d.metadata?.activationUrl);
            if (activationDetail?.metadata?.activationUrl) {
              yield* Effect.logWarning(`Enable the API at: ${activationDetail.metadata.activationUrl}`);
            }
          }
        } catch {
          yield* Effect.logWarning(`Raw error response: ${result.error.data}`);
        }
      }
    } else {
      yield* Effect.logWarning(`Failed to export spans: ${result.error?.message || "Unknown error"}`);
    }
  });

/**
 * Creates an OTLP trace exporter for remote endpoints
 */
const createOtlpTraceExporter = (url: string): Effect.Effect<BatchSpanProcessor, never, never> =>
  Effect.try(() => {
    const exporter = new OTLPTraceExporter({ url });

    // Create a monitored exporter that logs responses
    const runtime = Runtime.defaultRuntime;
    const monitoredExporter = {
      export: (spans: any, resultCallback: (result: any) => void) => {
        exporter.export(spans, (result: any) => {
          // Log the result asynchronously
          Runtime.runPromise(runtime)(
            logExportResult({
              code: result.code,
              error: result.error,
              spans: spans.length,
            }),
          ).catch(() => {
            // Ignore logging errors
          });

          resultCallback(result);
        });
      },
      shutdown: () => exporter.shutdown(),
    };

    return new BatchSpanProcessor(monitoredExporter as any);
  }).pipe(
    Effect.catchAll(() =>
      Effect.gen(function* () {
        yield* Effect.logWarning("Failed to initialize OTLP trace exporter");
        yield* Effect.logWarning("Falling back to console exporter");
        return new BatchSpanProcessor(new ConsoleSpanExporter());
      }),
    ),
  );

/**
 * Factory function that creates a Tracing implementation
 */
const makeTracingLive = (
  configLoader: typeof ConfigLoaderTag.Service,
  versionService: typeof VersionTag.Service,
): Tracing => ({
  createSdkConfig: () =>
    Effect.gen(function* () {
      const appConfig = yield* configLoader
        .load()
        .pipe(Effect.catchAll((error) => new TracingError({ reason: `Failed to load config: ${error._tag}` })));
      const telemetryConfig = appConfig.telemetry;

      // Get version from the version service
      const version = yield* versionService.getVersion.pipe(
        Effect.catchAll(() => Effect.succeed("0.0.1")),
        Effect.withSpan("version.get_cli"),
      );

      // Determine span processor based on telemetry mode
      // Mode is guaranteed to exist after schema parsing with defaults
      let spanProcessor: NodeSdk.Configuration["spanProcessor"];

      switch (telemetryConfig.mode) {
        case "console":
          yield* Effect.logDebug("Telemetry: Using console exporter");
          spanProcessor = new BatchSpanProcessor(new ConsoleSpanExporter());
          break;

        case "remote":
          yield* Effect.logDebug("Telemetry: Using remote OTLP exporter");
          spanProcessor = yield* createOtlpTraceExporter("https://usedevup.com/api/traces");
          break;

        case "disabled":
          yield* Effect.logDebug("Telemetry: Disabled");
          spanProcessor = new NoopSpanProcessor();
          break;

        default:
          // This should never happen due to schema validation
          yield* Effect.logWarning(`Telemetry: Unknown mode '${telemetryConfig.mode}', using noop processor`);
          spanProcessor = new NoopSpanProcessor();
          break;
      }

      // Create resource with proper attributes using semantic conventions
      const resourceAttributes: Record<string, string> = {
        [ATTR_SERVICE_NAME]: "dev-cli",
        [ATTR_SERVICE_VERSION]: version,
      };

      const resource = resources.resourceFromAttributes(resourceAttributes);

      // Return immutable configuration using the properly created resource
      const sdkConfig: NodeSdk.Configuration = {
        resource: {
          serviceName: "dev-cli",
          serviceVersion: version,
          attributes: resource.attributes,
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
    const versionService = yield* VersionTag;
    return makeTracingLive(configLoader, versionService);
  }),
);
