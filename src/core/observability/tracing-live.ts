import type { NodeSdk } from "@effect/opentelemetry";
import * as resources from "@opentelemetry/resources";
import { BatchSpanProcessor, ConsoleSpanExporter, NoopSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_SERVICE_INSTANCE_ID,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { ATTR_APP_INSTALLATION_ID } from "@opentelemetry/semantic-conventions/incubating";
import { Effect, Layer } from "effect";

import { InstallIdentityTag } from "~/capabilities/persistence/install-identity-port";
import { ConfigLoaderTag } from "~/core/config/config-loader-port";
import { tracingExporterFactories } from "~/core/observability/tracing-exporter-registry-live";
import type { RemoteTelemetryConfig, RemoteTelemetryMode } from "~/core/observability/tracing-exporter-types";
import { TracingError, TracingTag, type Tracing } from "~/core/observability/tracing-port";
import { VersionTag } from "~/core/runtime/version-port";

const OTLP_SERVICE_NAMESPACE = "dev";
const OTLP_SERVICE_NAME = "cli";

const createRemoteSpanProcessor = <Mode extends RemoteTelemetryMode>(
  telemetryConfig: Extract<RemoteTelemetryConfig, { readonly mode: Mode }>,
): Effect.Effect<NodeSdk.Configuration["spanProcessor"], never, never> =>
  tracingExporterFactories[telemetryConfig.mode].createSpanProcessor(telemetryConfig);

export const TracingLiveLayer = Layer.effect(
  TracingTag,
  Effect.gen(function* () {
    const configLoader = yield* ConfigLoaderTag;
    const versionService = yield* VersionTag;
    const installIdentityService = yield* InstallIdentityTag;
    return {
      createSdkConfig: () =>
        Effect.gen(function* () {
          const runtimeServiceInstanceId = yield* Effect.sync(() => Bun.randomUUIDv7());
          const appConfig = yield* configLoader
            .load()
            .pipe(Effect.catchAll((error) => Effect.fail(new TracingError({ message: `Failed to load config: ${error._tag}` }))));
          const telemetryConfig = appConfig.telemetry;

          const version = yield* versionService.getVersion().pipe(
            Effect.orElseSucceed(() => "0.0.1"),
            Effect.withSpan("version.get_cli"),
          );
          const installId = yield* installIdentityService
            .getOrCreateInstallId()
            .pipe(Effect.catchAll((error) => Effect.fail(new TracingError({ message: `Failed to get install identity: ${error._tag}` }))));

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
            [ATTR_SERVICE_NAMESPACE]: OTLP_SERVICE_NAMESPACE,
            [ATTR_SERVICE_NAME]: OTLP_SERVICE_NAME,
            [ATTR_SERVICE_VERSION]: version,
            [ATTR_SERVICE_INSTANCE_ID]: runtimeServiceInstanceId,
            [ATTR_APP_INSTALLATION_ID]: installId,
          };

          const resource = resources.resourceFromAttributes(resourceAttributes);

          return {
            resource: {
              serviceName: OTLP_SERVICE_NAME,
              serviceVersion: version,
              attributes: resource.attributes,
            },
            spanProcessor,
          } satisfies NodeSdk.Configuration;
        }),
    } satisfies Tracing;
  }),
);
