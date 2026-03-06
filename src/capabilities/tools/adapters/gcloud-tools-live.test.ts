import path from "path";

import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { FileSystemMock } from "~/capabilities/system/file-system-mock";
import { FileSystem } from "~/capabilities/system/file-system-port";
import { ShellMock } from "~/capabilities/system/shell-mock";
import { Shell } from "~/capabilities/system/shell-port";
import { GcloudTools } from "~/capabilities/tools/adapters/gcloud-tools-live";
import { EnvironmentPaths } from "~/core/runtime/path-service";
import { makeEnvironmentPathsMock } from "~/core/runtime/path-service-mock";

const makeSubject = () => {
  const shell = new ShellMock();
  const fileSystem = new FileSystemMock();
  const environmentPaths = makeEnvironmentPathsMock({
    homeDir: "/custom/home",
    xdgConfigHome: "/custom/xdg",
  });
  const configDir = path.join(environmentPaths.xdgConfigHome, "gcloud");
  const gcloudTools = Effect.gen(function* () {
    return yield* GcloudTools;
  }).pipe(
    Effect.provide(
      Layer.provide(
        GcloudTools.DefaultWithoutDependencies,
        Layer.mergeAll(
          Layer.succeed(Shell, shell),
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(EnvironmentPaths, environmentPaths),
        ),
      ),
    ),
  );

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

      const tools = yield* gcloudTools;
      yield* tools.setupConfig();

      expect(fileSystem.existsCalls).toContain(configDir);
      expect(fileSystem.mkdirCalls).toEqual([{ path: configDir, recursive: true }]);
    }),
  );

  it.effect("setupConfig skips mkdir when config directory already exists", () =>
    Effect.gen(function* () {
      const { fileSystem, gcloudTools, configDir } = makeSubject();
      fileSystem.existingPaths.add(configDir);

      const tools = yield* gcloudTools;
      yield* tools.setupConfig();

      expect(fileSystem.existsCalls).toContain(configDir);
      expect(fileSystem.mkdirCalls).toHaveLength(0);
    }),
  );
});
