import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor, ConsoleSpanExporter, type ReadableSpan, type SpanExporter } from "@opentelemetry/sdk-trace-base";
import { Effect, Runtime } from "effect";

import type { Config } from "../domain/config-schema";
import type { TracingExporterFactory } from "./tracing-exporter-types";

interface AxiomExportError extends Error {
  readonly code?: number;
  readonly data?: unknown;
}

interface AxiomExportOutcome {
  readonly exportResult: ExportResult;
  readonly spans: number;
}

type AxiomTelemetryConfig = Extract<Config["telemetry"], { readonly mode: "axiom" }>;

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

  const match = error.details.find(
    (detail: unknown): detail is Record<string, Record<string, unknown>> =>
      isRecord(detail) && isRecord(detail.metadata) && typeof detail.metadata.activationUrl === "string",
  );

  return match?.metadata?.activationUrl as string | undefined;
};

const logExportResult = (result: AxiomExportOutcome) =>
  Effect.gen(function* () {
    if (result.exportResult.code === ExportResultCode.SUCCESS) {
      return;
    }

    const exportError = result.exportResult.error as AxiomExportError | undefined;

    if (typeof exportError?.code === "number") {
      yield* Effect.logWarning(`Failed to export ${result.spans} spans to Axiom OTLP endpoint (HTTP ${exportError.code})`);

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
      return;
    }

    yield* Effect.logWarning(`Failed to export spans to Axiom OTLP: ${exportError?.message || "Unknown error"}`);
  });

const createAxiomOtlpSpanProcessor = (config: AxiomTelemetryConfig["axiom"]): Effect.Effect<BatchSpanProcessor, never, never> =>
  Effect.try(() => {
    const exporter = new OTLPTraceExporter({
      url: config.endpoint,
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "X-Axiom-Dataset": config.dataset,
      },
    });

    const runtime = Runtime.defaultRuntime;
    const monitoredExporter: SpanExporter = {
      export: (spans: ReadableSpan[], resultCallback: (result: ExportResult) => void) => {
        exporter.export(spans, (exportResult: ExportResult) => {
          Runtime.runPromise(runtime)(
            logExportResult({
              exportResult,
              spans: spans.length,
            }),
          ).catch(() => {
            // Ignore exporter logging failures
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

export const axiomTracingExporterFactory: TracingExporterFactory<"axiom"> = {
  mode: "axiom",
  createSpanProcessor: (telemetryConfig) =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Telemetry: Using Axiom OTLP trace exporter");
      return yield* createAxiomOtlpSpanProcessor(telemetryConfig.axiom);
    }),
};
