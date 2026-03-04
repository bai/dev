import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { MockFileSystem, MockShell, makePathService } from "../test-port-mocks";
import { makeGcloudToolsLive } from "./gcloud-tools-live";

const makeSubject = () => {
  const shell = new MockShell();
  const fileSystem = new MockFileSystem();
  const pathService = makePathService({
    homeDir: "/custom/home",
    baseSearchPath: "/custom/home/src",
    devDir: "/custom/home/.dev",
    configDir: "/custom/home/.config/dev",
    configPath: "/custom/home/.config/dev/config.json",
    dataDir: "/custom/home/.local/share/dev",
    dbPath: "/custom/home/.local/share/dev/dev.db",
    cacheDir: "/custom/home/.cache/dev",
  });
  const gcloudTools = makeGcloudToolsLive(shell, fileSystem, pathService);
  const configDir = path.join(pathService.homeDir, ".config", "gcloud");

  return {
    fileSystem,
    gcloudTools,
    configDir,
  };
};

describe("gcloud-tools-live", () => {
  it.effect("setupConfig uses pathService home directory for gcloud config path", () =>
    Effect.gen(function* () {
      const { fileSystem, gcloudTools, configDir } = makeSubject();

      yield* gcloudTools.setupConfig();

      expect(fileSystem.existsCalls).toContain(configDir);
      expect(fileSystem.mkdirCalls).toEqual([{ path: configDir, recursive: true }]);
    }),
  );

  it.effect("setupConfig skips mkdir when config directory already exists", () =>
    Effect.gen(function* () {
      const { fileSystem, gcloudTools, configDir } = makeSubject();
      fileSystem.existingPaths.add(configDir);

      yield* gcloudTools.setupConfig();

      expect(fileSystem.existsCalls).toContain(configDir);
      expect(fileSystem.mkdirCalls).toHaveLength(0);
    }),
  );
});
