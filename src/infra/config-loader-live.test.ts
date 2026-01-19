import fs from "fs/promises";
import os from "os";
import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect } from "vitest";

import type { Network } from "../domain/network-port";
import { makeFileSystemLive } from "./file-system-live";
import { makeConfigLoaderLive } from "./config-loader-live";

describe("config-loader-live", () => {
  const fileSystem = makeFileSystemLive();
  let tempDir: string;
  let configPath: string;

  // Mock network that's not used in these tests
  const mockNetwork: Network = {
    get: () => Effect.succeed({ status: 200, statusText: "OK", body: "{}" }),
  };

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

        const configLoader = makeConfigLoaderLive(fileSystem, mockNetwork, configPath);
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

        const configLoader = makeConfigLoaderLive(fileSystem, mockNetwork, configPath);
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

        const configLoader = makeConfigLoaderLive(fileSystem, mockNetwork, configPath);
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

        const configLoader = makeConfigLoaderLive(fileSystem, mockNetwork, configPath);
        const config = yield* configLoader.load();

        expect(config.defaultOrg).toBe("testorg");
        expect(config.services).toEqual({ postgres17: {}, valkey: {} });
      }),
    );
  });
});
