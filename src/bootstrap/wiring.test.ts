import fs from "fs/promises";
import os from "os";
import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect } from "vitest";

import { loadConfiguration, setupApplication } from "~/bootstrap/wiring";

describe("wiring", () => {
  let tempDir: string;
  let configPath: string;
  let workspacePath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-wiring-test-"));
    configPath = path.join(tempDir, "config.json");
    workspacePath = path.join(tempDir, "workspace");
    await fs.mkdir(workspacePath, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it.effect("loadConfiguration loads config from an explicit path", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.writeFile(
          configPath,
          JSON.stringify(
            {
              defaultOrg: "acme",
              defaultProvider: "github",
              baseSearchPath: workspacePath,
              telemetry: { mode: "disabled" },
            },
            null,
            2,
          ),
        ),
      );

      const config = yield* loadConfiguration({ configPath });

      expect(config.defaultOrg).toBe("acme");
      expect(config.baseSearchPath).toBe(workspacePath);
    }),
  );

  it.effect("loadConfiguration propagates ConfigError for invalid config", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => fs.writeFile(configPath, "{ invalid-json", "utf8"));

      const error = yield* Effect.flip(loadConfiguration({ configPath }));

      expect(error._tag).toBe("ConfigError");
      expect(error.message).toContain("Invalid config file");
    }),
  );

  it.effect("setupApplication propagates configuration load failures", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() => fs.writeFile(configPath, "{ invalid-json", "utf8"));

      const error = yield* Effect.flip(setupApplication({ configPath }));

      expect(error._tag).toBe("ConfigError");
    }),
  );

  it.effect("setupApplication builds app layer and ensures base directory", () =>
    Effect.gen(function* () {
      const baseSearchPath = path.join(tempDir, "workspace", "nested");
      yield* Effect.promise(() =>
        fs.writeFile(
          configPath,
          JSON.stringify(
            {
              defaultOrg: "acme",
              defaultProvider: "github",
              baseSearchPath,
              telemetry: { mode: "disabled" },
            },
            null,
            2,
          ),
        ),
      );

      const result = yield* setupApplication({ configPath });

      expect(result.config.baseSearchPath).toBe(baseSearchPath);
      expect(result.appLayer).toBeDefined();
      const baseDirectoryExists = yield* Effect.promise(() =>
        fs
          .access(baseSearchPath)
          .then(() => true)
          .catch(() => false),
      );
      expect(baseDirectoryExists).toBe(true);
    }),
  );
});
