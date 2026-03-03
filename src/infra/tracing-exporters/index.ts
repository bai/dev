import { axiomTracingExporterFactory } from "./axiom-tracing-exporter";
import type { TracingExporterFactoryMap } from "./types";

export const tracingExporterFactories = {
  axiom: axiomTracingExporterFactory,
} as const satisfies TracingExporterFactoryMap;
