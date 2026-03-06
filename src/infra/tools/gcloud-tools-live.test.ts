import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { FileSystemMock } from "../file-system-mock";
import { makePathServiceMock } from "../path-service-mock";
import { ShellMock } from "../shell-mock";
import { makeGcloudToolsLive } from "./gcloud-tools-live";

const makeSubject = () => {
  const shell = new ShellMock();
  const fileSystem = new FileSystemMock();
  const pathService = makePathServiceMock({
    homeDir: "/custom/home",
    xdgConfigHome: "/custom/xdg",
    xdgDataHome: "/custom/data",
    xdgCacheHome: "/custom/cache",
    baseSearchPath: "/custom/home/src",
    devDir: "/custom/home/.dev",
  });
  const gcloudTools = makeGcloudToolsLive(shell, fileSystem, pathService);
  const configDir = path.join(path.dirname(pathService.configDir), "gcloud");

  return {
    fileSystem,
    gcloudTools,
    configDir,
  };
};

describe("gcloud-tools-live", () => {
  it.effect("setupConfig uses the shared XDG config root for gcloud config path", () =>
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
