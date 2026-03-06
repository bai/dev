import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { FileSystemMock } from "~/capabilities/system/file-system-mock";
import { ShellMock } from "~/capabilities/system/shell-mock";
import { makeGcloudToolsLive } from "~/capabilities/tools/adapters/gcloud-tools-live";
import { makeHostPathsMock } from "~/core/runtime/path-service-mock";

const makeSubject = () => {
  const shell = new ShellMock();
  const fileSystem = new FileSystemMock();
  const hostPaths = makeHostPathsMock({
    homeDir: "/custom/home",
    xdgConfigHome: "/custom/xdg",
    xdgDataHome: "/custom/data",
    xdgCacheHome: "/custom/cache",
    devDir: "/custom/home/.dev",
  });
  const gcloudTools = makeGcloudToolsLive(shell, fileSystem, hostPaths);
  const configDir = path.join(path.dirname(hostPaths.configDir), "gcloud");

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
