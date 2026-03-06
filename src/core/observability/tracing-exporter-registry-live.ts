import { axiomTracingExporterFactory } from "~/core/observability/adapters/axiom-tracing-exporter-live";
import type { TracingExporterFactoryMap } from "~/core/observability/tracing-exporter-types";

export const tracingExporterFactories = {
  axiom: axiomTracingExporterFactory,
} as const satisfies TracingExporterFactoryMap;
