import { it } from "@effect/vitest";
import { BatchSpanProcessor, NoopSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_INSTANCE_ID, ATTR_SERVICE_NAME, ATTR_SERVICE_NAMESPACE } from "@opentelemetry/semantic-conventions";
import { ATTR_APP_INSTALLATION_ID } from "@opentelemetry/semantic-conventions/incubating";
import { Effect } from "effect";
import { afterEach, describe, expect, vi } from "vitest";

import type { ConfigLoader } from "../../domain/config-loader-port";
import { ConfigLoaderTag } from "../../domain/config-loader-port";
import { configSchema } from "../../domain/config-schema";
import { GitTag } from "../../domain/git-port";
import type { InstallIdentity } from "../../domain/install-identity-port";
import { InstallIdentityTag } from "../../domain/install-identity-port";
import { TracingTag } from "../../domain/tracing-port";
import type { Version } from "../../domain/version-port";
import { VersionTag } from "../../domain/version-port";
import { GitMock } from "../git-mock";
import { TracingLiveLayer } from "./tracing-live";

const mockVersion: Version = {
  getCurrentGitCommitSha: () => Effect.succeed("deadbeef"),
  getVersion: () => Effect.succeed("1.2.3"),
};

const mockGit = new GitMock({
  currentCommitSha: "deadbeef",
  currentBranch: "main",
  remoteUrl: "https://github.com/acme/repo",
});

const mockInstallIdentity: InstallIdentity = {
  getOrCreateInstallId: () => Effect.succeed("0196ed78-467a-7f2f-bf6b-95e73fd43b8d"),
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
    Effect.provideService(InstallIdentityTag, mockInstallIdentity),
    Effect.provideService(GitTag, mockGit),
  );

describe("tracing-live", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect("uses console span processor when telemetry mode is console", () =>
    Effect.gen(function* () {
      const config = configSchema.parse({
        telemetry: { mode: "console" },
      });

      const sdkConfig = yield* loadSdkConfig(config);

      expect(sdkConfig.spanProcessor).toBeInstanceOf(BatchSpanProcessor);
      expect(sdkConfig.resource?.serviceName).toBe("cli");
      expect(sdkConfig.resource?.serviceVersion).toBe("1.2.3");
      expect(sdkConfig.resource?.attributes?.[ATTR_SERVICE_NAMESPACE]).toBe("dev");
      expect(sdkConfig.resource?.attributes?.[ATTR_SERVICE_NAME]).toBe("cli");
      expect(typeof sdkConfig.resource?.attributes?.[ATTR_SERVICE_INSTANCE_ID]).toBe("string");
      expect(String(sdkConfig.resource?.attributes?.[ATTR_SERVICE_INSTANCE_ID]).length).toBe(36);
      expect(String(sdkConfig.resource?.attributes?.[ATTR_SERVICE_INSTANCE_ID])[14]).toBe("7");
      expect(sdkConfig.resource?.attributes?.[ATTR_SERVICE_INSTANCE_ID]).not.toBe("0196ed78-467a-7f2f-bf6b-95e73fd43b8d");
      expect(sdkConfig.resource?.attributes?.[ATTR_APP_INSTALLATION_ID]).toBe("0196ed78-467a-7f2f-bf6b-95e73fd43b8d");
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

  it.effect("generates a new runtime service instance id on each sdk config call", () =>
    Effect.gen(function* () {
      const firstRuntimeId = "0196ed78-467a-7f2f-bf6b-95e73fd43b8e";
      const secondRuntimeId = "0196ed78-467a-7f2f-bf6b-95e73fd43b8f";
      const randomUuidSpy = vi
        .spyOn(Bun, "randomUUIDv7")
        .mockImplementationOnce(() => firstRuntimeId as unknown as ReturnType<typeof Bun.randomUUIDv7>)
        .mockImplementationOnce(() => secondRuntimeId as unknown as ReturnType<typeof Bun.randomUUIDv7>);

      const config = configSchema.parse({
        telemetry: { mode: "disabled" },
      });

      const firstSdkConfig = yield* loadSdkConfig(config);
      const secondSdkConfig = yield* loadSdkConfig(config);

      expect(firstSdkConfig.resource?.attributes?.[ATTR_SERVICE_INSTANCE_ID]).toBe(firstRuntimeId);
      expect(secondSdkConfig.resource?.attributes?.[ATTR_SERVICE_INSTANCE_ID]).toBe(secondRuntimeId);
      expect(randomUuidSpy).toHaveBeenCalledTimes(2);
    }),
  );
});
