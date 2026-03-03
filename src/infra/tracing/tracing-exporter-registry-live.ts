import { axiomTracingExporterFactory } from "./axiom-tracing-exporter-live";
import type { TracingExporterFactoryMap } from "./tracing-exporter-types";

export const tracingExporterFactories = {
  axiom: axiomTracingExporterFactory,
} as const satisfies TracingExporterFactoryMap;
