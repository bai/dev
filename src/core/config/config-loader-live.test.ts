import fs from "fs/promises";
import os from "os";
import path from "path";

import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { afterEach, beforeEach, describe, expect } from "vitest";

import { FileSystemLive } from "~/capabilities/system/file-system-live";
import { FileSystemTag } from "~/capabilities/system/file-system-port";
import { NetworkTag, type Network } from "~/capabilities/system/network-port";
import { ConfigLoaderLiveLayer } from "~/core/config/config-loader-live";
import { ConfigLoaderTag } from "~/core/config/config-loader-port";
import { configSchema } from "~/core/config/config-schema";
import { StatePathsTag } from "~/core/runtime/path-service";
import { makeStatePathsMock } from "~/core/runtime/path-service-mock";

describe("config-loader-live", () => {
  let tempDir: string;
  let configPath: string;

  // Mock network that's not used in these tests
  const mockNetwork: Network = {
    get: () => Effect.succeed({ status: 200, statusText: "OK", body: "{}", headers: {} }),
    downloadFile: () => Effect.void,
    checkConnectivity: () => Effect.succeed(true),
  };

  const makeConfigLoader = (network: Network) =>
    Effect.gen(function* () {
      return yield* ConfigLoaderTag;
    }).pipe(
      Effect.provide(
        Layer.provide(
          ConfigLoaderLiveLayer,
          Layer.mergeAll(
            Layer.succeed(FileSystemTag, FileSystemLive),
            Layer.succeed(NetworkTag, network),
            Layer.succeed(StatePathsTag, makeStatePathsMock({ configPath })),
          ),
        ),
      ),
    );

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `config-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    await fs.mkdir(tempDir, { recursive: true });
    configPath = path.join(tempDir, "config.json");
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("JSONC parsing", () => {
    it.effect("parses config with single-line comments", () =>
      Effect.gen(function* () {
        const content = `{
  // This is a comment
  "defaultOrg": "testorg"
}`;
        yield* Effect.promise(() => fs.writeFile(configPath, content));

        const configLoader = yield* makeConfigLoader(mockNetwork);
        const config = yield* configLoader.load();

        expect(config.defaultOrg).toBe("testorg");
      }),
    );

    it.effect("parses config with multi-line comments", () =>
      Effect.gen(function* () {
        const content = `{
  /* This is a
     multi-line comment */
  "defaultOrg": "testorg"
}`;
        yield* Effect.promise(() => fs.writeFile(configPath, content));

        const configLoader = yield* makeConfigLoader(mockNetwork);
        const config = yield* configLoader.load();

        expect(config.defaultOrg).toBe("testorg");
      }),
    );

    it.effect("parses config with trailing commas", () =>
      Effect.gen(function* () {
        const content = `{
  "defaultOrg": "testorg",
  "services": {
    "postgres17": {},
    "valkey": {},
  },
}`;
        yield* Effect.promise(() => fs.writeFile(configPath, content));

        const configLoader = yield* makeConfigLoader(mockNetwork);
        const config = yield* configLoader.load();

        expect(config.defaultOrg).toBe("testorg");
        expect(config.services).toEqual({ postgres17: {}, valkey: {} });
      }),
    );

    it.effect("parses config with comments and trailing commas combined", () =>
      Effect.gen(function* () {
        const content = `{
  // Organization settings
  "defaultOrg": "testorg",

  /* Docker services configuration
     - postgres17: PostgreSQL 17
     - valkey: Redis-compatible store */
  "services": {
    "postgres17": {}, // Primary database
    "valkey": {},     // Cache layer
  },
}`;
        yield* Effect.promise(() => fs.writeFile(configPath, content));

        const configLoader = yield* makeConfigLoader(mockNetwork);
        const config = yield* configLoader.load();

        expect(config.defaultOrg).toBe("testorg");
        expect(config.services).toEqual({ postgres17: {}, valkey: {} });
      }),
    );
  });

  describe("refresh", () => {
    it.effect("updates local config with validated remote config", () =>
      Effect.gen(function* () {
        const localConfig = {
          configUrl: "https://example.com/remote-config.json",
          defaultOrg: "local-org",
          telemetry: { mode: "disabled" },
        };
        yield* Effect.promise(() => fs.writeFile(configPath, JSON.stringify(localConfig, null, 2)));

        const remoteNetwork: Network = {
          get: () =>
            Effect.succeed({
              status: 200,
              statusText: "OK",
              body: JSON.stringify({
                configUrl: "https://example.com/remote-config.json",
                defaultOrg: "remote-org",
                telemetry: { mode: "disabled" },
                services: { postgres17: {} },
              }),
              headers: {},
            }),
          downloadFile: () => Effect.void,
          checkConnectivity: () => Effect.succeed(true),
        };

        const configLoader = yield* makeConfigLoader(remoteNetwork);
        const refreshedConfig = yield* configLoader.refresh();

        expect(refreshedConfig.defaultOrg).toBe("remote-org");
        expect(refreshedConfig.services).toEqual({ postgres17: {} });

        const persistedConfig = yield* Effect.promise(() => fs.readFile(configPath, "utf8"));
        const parsedPersistedConfig = configSchema.parse(Bun.JSONC.parse(persistedConfig));
        expect(parsedPersistedConfig.defaultOrg).toBe("remote-org");
      }),
    );

    it.effect("fails fast for invalid remote config and keeps local config unchanged", () =>
      Effect.gen(function* () {
        const localConfig = {
          configUrl: "https://example.com/remote-config.json",
          defaultOrg: "local-org",
          telemetry: { mode: "disabled" },
        };
        yield* Effect.promise(() => fs.writeFile(configPath, JSON.stringify(localConfig, null, 2)));

        const invalidRemoteNetwork: Network = {
          get: () =>
            Effect.succeed({
              status: 200,
              statusText: "OK",
              body: "{ invalid-json",
              headers: {},
            }),
          downloadFile: () => Effect.void,
          checkConnectivity: () => Effect.succeed(true),
        };

        const configLoader = yield* makeConfigLoader(invalidRemoteNetwork);
        const result = yield* Effect.exit(configLoader.refresh());

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const failure = Cause.failureOption(result.cause);
          expect(Option.isSome(failure)).toBe(true);
          if (Option.isSome(failure)) {
            expect(failure.value._tag).toBe("ConfigError");
          }
        }

        const persistedConfig = yield* Effect.promise(() => fs.readFile(configPath, "utf8"));
        const parsedPersistedConfig = configSchema.parse(Bun.JSONC.parse(persistedConfig));
        expect(parsedPersistedConfig.defaultOrg).toBe("local-org");
      }),
    );

    it.effect("fails fast for non-200 remote responses", () =>
      Effect.gen(function* () {
        const localConfig = {
          configUrl: "https://example.com/remote-config.json",
          defaultOrg: "local-org",
          telemetry: { mode: "disabled" },
        };
        yield* Effect.promise(() => fs.writeFile(configPath, JSON.stringify(localConfig, null, 2)));

        const failingRemoteNetwork: Network = {
          get: () =>
            Effect.succeed({
              status: 503,
              statusText: "Service Unavailable",
              body: "{}",
              headers: {},
            }),
          downloadFile: () => Effect.void,
          checkConnectivity: () => Effect.succeed(true),
        };

        const configLoader = yield* makeConfigLoader(failingRemoteNetwork);
        const result = yield* Effect.exit(configLoader.refresh());

        expect(Exit.isFailure(result)).toBe(true);
        if (Exit.isFailure(result)) {
          const failure = Cause.failureOption(result.cause);
          expect(Option.isSome(failure)).toBe(true);
          if (Option.isSome(failure)) {
            expect(failure.value._tag).toBe("ConfigError");
          }
        }
      }),
    );
  });
});
