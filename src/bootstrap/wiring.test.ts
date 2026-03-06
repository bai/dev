import fs from "fs/promises";
import os from "os";
import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect } from "vitest";

import { CommandRegistry } from "~/bootstrap/command-registry-port";
import { loadConfiguration, setupApplication } from "~/bootstrap/wiring";
import { Tracing } from "~/core/observability/tracing-port";
import { makeEnvironmentPathsMock, makeInstallPathsMock, makeStatePathsMock } from "~/core/runtime/path-service-mock";
import { Version } from "~/core/runtime/version-port";
import { UpdateChecker } from "~/features/upgrade/update-check-service";

describe("wiring", () => {
  let tempDir: string;
  let configPath: string;
  let workspacePath: string;

  const makeSetupOptions = () => {
    const stateDir = path.join(tempDir, "state");

    return {
      configPath,
      environmentPaths: makeEnvironmentPathsMock({
        homeDir: tempDir,
        cwd: process.cwd(),
        xdgConfigHome: path.join(tempDir, "xdg-config"),
      }),
      installPaths: makeInstallPathsMock({
        installMode: "repo",
        installDir: process.cwd(),
        upgradeCapable: true,
      }),
      statePaths: makeStatePathsMock({
        stateDir,
        configPath,
        dbPath: path.join(stateDir, "dev.db"),
        cacheDir: path.join(stateDir, "cache"),
        dockerDir: path.join(stateDir, "docker"),
        runDir: path.join(stateDir, "run"),
      }),
    };
  };

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-wiring-test-"));
    configPath = path.join(tempDir, "state", "config.json");
    workspacePath = path.join(tempDir, "workspace");
    await fs.mkdir(workspacePath, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it.effect("loadConfiguration loads config from an explicit path", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.mkdir(path.dirname(configPath), { recursive: true }).then(() =>
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
        ),
      );

      const config = yield* loadConfiguration(makeSetupOptions());

      expect(config.defaultOrg).toBe("acme");
      expect(config.baseSearchPath).toBe(workspacePath);
    }),
  );

  it.effect("loadConfiguration propagates ConfigError for invalid config", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.mkdir(path.dirname(configPath), { recursive: true }).then(() => fs.writeFile(configPath, "{ invalid-json", "utf8")),
      );

      const error = yield* Effect.flip(loadConfiguration(makeSetupOptions()));

      expect(error._tag).toBe("ConfigError");
      expect(error.message).toContain("Invalid config file");
    }),
  );

  it.effect("setupApplication propagates configuration load failures", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        fs.mkdir(path.dirname(configPath), { recursive: true }).then(() => fs.writeFile(configPath, "{ invalid-json", "utf8")),
      );

      const error = yield* Effect.flip(setupApplication(makeSetupOptions()));

      expect(error._tag).toBe("ConfigError");
    }),
  );

  it.effect("setupApplication builds app layer and ensures base directory", () =>
    Effect.gen(function* () {
      const baseSearchPath = path.join(tempDir, "workspace", "nested");
      yield* Effect.promise(() =>
        fs.mkdir(path.dirname(configPath), { recursive: true }).then(() =>
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
        ),
      );

      const result = yield* setupApplication(makeSetupOptions());

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

  it.effect("setupApplication returns an app layer that resolves runtime services", () =>
    Effect.gen(function* () {
      const baseSearchPath = path.join(tempDir, "workspace", "nested");
      yield* Effect.promise(() =>
        fs.mkdir(path.dirname(configPath), { recursive: true }).then(() =>
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
        ),
      );

      const result = yield* setupApplication(makeSetupOptions());

      const services = yield* Effect.gen(function* () {
        const tracing = yield* Tracing;
        const version = yield* Version;
        const updateChecker = yield* UpdateChecker;
        const registry = yield* CommandRegistry;
        return { tracing, version, updateChecker, registry };
      }).pipe(Effect.provide(result.appLayer));

      expect(typeof services.tracing.createSdkConfig).toBe("function");
      expect(typeof services.version.getVersion).toBe("function");
      expect(typeof services.updateChecker.runPeriodicUpgradeCheck).toBe("function");
      expect(typeof services.registry.getCommands).toBe("function");

      const registeredCommands = yield* services.registry.getCommands();
      expect(registeredCommands).toEqual([]);
    }),
  );

  it.effect("setupApplication propagates directory initialization failures", () =>
    Effect.gen(function* () {
      const blockerPath = path.join(tempDir, "blocker");
      const baseSearchPath = path.join(blockerPath, "nested");

      yield* Effect.promise(() => fs.writeFile(blockerPath, "not-a-directory", "utf8"));
      yield* Effect.promise(() =>
        fs.mkdir(path.dirname(configPath), { recursive: true }).then(() =>
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
        ),
      );

      const error = yield* Effect.flip(setupApplication(makeSetupOptions()));

      expect(error._tag).toBe("FileSystemError");
      if (error._tag !== "FileSystemError") {
        return;
      }
      expect(error.path).toBe(baseSearchPath);
      expect(error.message).toContain("Failed to create directory");
    }),
  );
});
