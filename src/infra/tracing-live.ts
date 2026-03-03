import type { NodeSdk } from "@effect/opentelemetry";
import * as resources from "@opentelemetry/resources";
import { BatchSpanProcessor, ConsoleSpanExporter, NoopSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { Effect, Layer } from "effect";

import { ConfigLoaderTag } from "../domain/config-loader-port";
import { TracingError, TracingTag, type Tracing } from "../domain/tracing-port";
import { VersionTag } from "../domain/version-port";
import { tracingExporterFactories } from "./tracing-exporters";
import type { RemoteTelemetryConfig, RemoteTelemetryMode } from "./tracing-exporters/types";

const createRemoteSpanProcessor = <Mode extends RemoteTelemetryMode>(
  telemetryConfig: Extract<RemoteTelemetryConfig, { readonly mode: Mode }>,
): Effect.Effect<NodeSdk.Configuration["spanProcessor"], never, never> =>
  tracingExporterFactories[telemetryConfig.mode].createSpanProcessor(telemetryConfig);

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

      const spanProcessor = yield* Effect.gen(function* () {
        if (telemetryConfig.mode === "console") {
          yield* Effect.logDebug("Telemetry: Using console exporter");
          return new BatchSpanProcessor(new ConsoleSpanExporter());
        }

        if (telemetryConfig.mode === "disabled") {
          yield* Effect.logDebug("Telemetry: Disabled");
          return new NoopSpanProcessor();
        }

        return yield* createRemoteSpanProcessor(telemetryConfig);
      });

      const resourceAttributes: Record<string, string> = {
        [ATTR_SERVICE_NAME]: "dev-cli",
        [ATTR_SERVICE_VERSION]: version,
      };

      const resource = resources.resourceFromAttributes(resourceAttributes);

      return {
        resource: {
          serviceName: "dev-cli",
          serviceVersion: version,
          attributes: resource.attributes,
        },
        spanProcessor,
      } satisfies NodeSdk.Configuration;
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
