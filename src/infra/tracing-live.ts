import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import type { NodeSdk } from "@effect/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import * as resources from "@opentelemetry/resources";
import { BatchSpanProcessor, ConsoleSpanExporter, NoopSpanProcessor, type ReadableSpan, type SpanExporter } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { Effect, Layer, Runtime } from "effect";

import { ConfigLoaderTag } from "../domain/config-loader-port";
import type { Config } from "../domain/config-schema";
import { TracingError, TracingTag, type Tracing } from "../domain/tracing-port";
import { VersionTag } from "../domain/version-port";

interface AxiomOtlpConfig {
  readonly endpoint: string;
  readonly apiKey: string;
  readonly dataset: string;
}

interface OtlpExportError extends Error {
  readonly code?: number;
  readonly data?: unknown;
}

interface ExportOutcome {
  readonly exportResult: ExportResult;
  readonly spans: number;
}

/**
 * Logs export results from Axiom OTLP trace endpoint
 */
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const parsePayload = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const extractErrorMessage = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const error = value.error;
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.message === "string" ? error.message : undefined;
};

const extractActivationUrl = (value: unknown): string | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const error = value.error;
  if (!isRecord(error) || !Array.isArray(error.details)) {
    return undefined;
  }

  for (const detail of error.details) {
    if (!isRecord(detail) || !isRecord(detail.metadata)) {
      continue;
    }

    if (typeof detail.metadata.activationUrl === "string") {
      return detail.metadata.activationUrl;
    }
  }

  return undefined;
};

const logExportResult = (result: ExportOutcome) =>
  Effect.gen(function* () {
    if (result.exportResult.code === ExportResultCode.SUCCESS) {
      // Success - no logging needed for normal operation
      return;
    }

    const exportError = result.exportResult.error as OtlpExportError | undefined;

    // Handle errors
    if (typeof exportError?.code === "number") {
      yield* Effect.logWarning(`Failed to export ${result.spans} spans to Axiom OTLP endpoint (HTTP ${exportError.code})`);

      // Parse error response if available
      if (exportError.data !== undefined) {
        const parsedPayload = parsePayload(exportError.data);
        const errorMessage = extractErrorMessage(parsedPayload);
        const activationUrl = extractActivationUrl(parsedPayload);

        if (errorMessage) {
          yield* Effect.logWarning(`Axiom OTLP error: ${errorMessage}`);
        }
        if (activationUrl) {
          yield* Effect.logWarning(`Enable API access at: ${activationUrl}`);
        }
        if (!errorMessage && !activationUrl) {
          yield* Effect.logWarning(`Axiom OTLP raw error response: ${String(exportError.data)}`);
        }
      }
    } else {
      yield* Effect.logWarning(`Failed to export spans to Axiom OTLP: ${exportError?.message || "Unknown error"}`);
    }
  });

/**
 * Creates an OTLP trace exporter for Axiom (without collector)
 */
const createOtlpTraceExporter = (config: AxiomOtlpConfig): Effect.Effect<BatchSpanProcessor, never, never> =>
  Effect.try(() => {
    const exporter = new OTLPTraceExporter({
      url: config.endpoint,
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "X-Axiom-Dataset": config.dataset,
      },
    });

    // Create a monitored exporter that logs responses
    const runtime = Runtime.defaultRuntime;
    const monitoredExporter: SpanExporter = {
      export: (spans: ReadableSpan[], resultCallback: (result: ExportResult) => void) => {
        exporter.export(spans, (exportResult: ExportResult) => {
          // Log the result asynchronously
          Runtime.runPromise(runtime)(
            logExportResult({
              exportResult,
              spans: spans.length,
            }),
          ).catch(() => {
            // Ignore logging errors
          });

          resultCallback(exportResult);
        });
      },
      shutdown: () => exporter.shutdown(),
    };

    return new BatchSpanProcessor(monitoredExporter);
  }).pipe(
    Effect.catchAll(() =>
      Effect.gen(function* () {
        yield* Effect.logWarning("Failed to initialize Axiom OTLP trace exporter");
        yield* Effect.logWarning("Falling back to console exporter");
        return new BatchSpanProcessor(new ConsoleSpanExporter());
      }),
    ),
  );

const createAxiomSpanProcessor = (
  telemetryConfig: Extract<Config["telemetry"], { readonly mode: "axiom" }>,
): Effect.Effect<NodeSdk.Configuration["spanProcessor"], never, never> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("Telemetry: Using Axiom OTLP trace exporter");
    return yield* createOtlpTraceExporter({
      endpoint: telemetryConfig.axiom.endpoint,
      apiKey: telemetryConfig.axiom.apiKey,
      dataset: telemetryConfig.axiom.dataset,
    });
  });

const exporterFactories = {
  axiom: createAxiomSpanProcessor,
} as const;

/**
 * Factory function that creates a Tracing implementation
 */
const makeTracingLive = (configLoader: typeof ConfigLoaderTag.Service, versionService: typeof VersionTag.Service): Tracing => ({
  createSdkConfig: () =>
    Effect.gen(function* () {
      const appConfig = yield* configLoader
        .load()
        .pipe(Effect.catchAll((error) => new TracingError({ reason: `Failed to load config: ${error._tag}` })));
      const telemetryConfig = appConfig.telemetry;

      // Get version from the version service
      const version = yield* versionService.getVersion.pipe(
        Effect.orElseSucceed(() => "0.0.1"),
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

        case "disabled":
          yield* Effect.logDebug("Telemetry: Disabled");
          spanProcessor = new NoopSpanProcessor();
          break;

        case "axiom":
          spanProcessor = yield* exporterFactories.axiom(telemetryConfig);
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
