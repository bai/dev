import { it } from "@effect/vitest";
import { BatchSpanProcessor, NoopSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import type { ConfigLoader } from "../domain/config-loader-port";
import { ConfigLoaderTag } from "../domain/config-loader-port";
import { configSchema } from "../domain/config-schema";
import type { Git } from "../domain/git-port";
import { GitTag } from "../domain/git-port";
import { PathLive, PathServiceTag } from "../domain/path-service";
import { TracingTag } from "../domain/tracing-port";
import type { Version } from "../domain/version-port";
import { VersionTag } from "../domain/version-port";
import { TracingLiveLayer } from "./tracing-live";

const mockVersion: Version = {
  getCurrentGitCommitSha: Effect.succeed("deadbeef"),
  getVersion: Effect.succeed("1.2.3"),
};

const mockGit: Git = {
  cloneRepositoryToPath: () => Effect.void,
  pullLatestChanges: () => Effect.void,
  isGitRepository: () => Effect.succeed(true),
  getCurrentCommitSha: () => Effect.succeed("deadbeef"),
  getRemoteOriginUrl: () => Effect.succeed("https://github.com/acme/repo"),
};

const makeConfigLoader = (config: ReturnType<typeof configSchema.parse>): ConfigLoader => ({
  load: () => Effect.succeed(config),
  save: () => Effect.void,
  refresh: () => Effect.succeed(config),
});

const loadSdkConfig = (config: ReturnType<typeof configSchema.parse>) =>
  Effect.gen(function* () {
    const tracing = yield* TracingTag;
    return yield* tracing.createSdkConfig();
  }).pipe(
    Effect.provide(TracingLiveLayer),
    Effect.provideService(ConfigLoaderTag, makeConfigLoader(config)),
    Effect.provideService(VersionTag, mockVersion),
    Effect.provideService(GitTag, mockGit),
    Effect.provideService(PathServiceTag, PathLive),
  );

describe("tracing-live", () => {
  it.effect("uses console span processor when telemetry mode is console", () =>
    Effect.gen(function* () {
      const config = configSchema.parse({
        telemetry: { mode: "console" },
      });

      const sdkConfig = yield* loadSdkConfig(config);

      expect(sdkConfig.spanProcessor).toBeInstanceOf(BatchSpanProcessor);
      expect(sdkConfig.resource?.serviceName).toBe("cli");
      expect(sdkConfig.resource?.serviceVersion).toBe("1.2.3");
      expect(sdkConfig.resource?.attributes?.["service.namespace"]).toBe("dev");
      expect(sdkConfig.resource?.attributes?.["service.name"]).toBe("cli");
    }),
  );

  it.effect("uses noop span processor when telemetry mode is disabled", () =>
    Effect.gen(function* () {
      const config = configSchema.parse({
        telemetry: { mode: "disabled" },
      });

      const sdkConfig = yield* loadSdkConfig(config);

      expect(sdkConfig.spanProcessor).toBeInstanceOf(NoopSpanProcessor);
    }),
  );

  it.effect("uses OTLP span processor when telemetry mode is axiom with valid config", () =>
    Effect.gen(function* () {
      const config = configSchema.parse({
        telemetry: {
          mode: "axiom",
          axiom: {
            endpoint: "https://api.axiom.co/v1/traces",
            apiKey: "xaat-test-key",
            dataset: "devcli",
          },
        },
      });

      const sdkConfig = yield* loadSdkConfig(config);

      expect(sdkConfig.spanProcessor).toBeInstanceOf(BatchSpanProcessor);
    }),
  );

  it.effect("invalid axiom config fails at schema validation before tracing runtime", () =>
    Effect.sync(() => {
      const result = configSchema.safeParse({
        telemetry: {
          mode: "axiom",
          axiom: {
            endpoint: "https://api.axiom.co/v1/traces",
            dataset: "devcli",
          },
        },
      });

      expect(result.success).toBe(false);
    }),
  );
});
