import type { NodeSdk } from "@effect/opentelemetry";
import type { Effect } from "effect";

import type { Config } from "~/core/config/config-schema";

type LocalTelemetryConfig = Extract<Config["telemetry"], { readonly mode: "disabled" | "console" }>;

export type RemoteTelemetryConfig = Exclude<Config["telemetry"], LocalTelemetryConfig>;
export type RemoteTelemetryMode = RemoteTelemetryConfig["mode"];

export interface TracingExporterFactory<Mode extends RemoteTelemetryMode = RemoteTelemetryMode> {
  readonly mode: Mode;
  readonly createSpanProcessor: (
    telemetryConfig: Extract<RemoteTelemetryConfig, { readonly mode: Mode }>,
  ) => Effect.Effect<NodeSdk.Configuration["spanProcessor"], never, never>;
}

export type TracingExporterFactoryMap = {
  readonly [Mode in RemoteTelemetryMode]: TracingExporterFactory<Mode>;
};
