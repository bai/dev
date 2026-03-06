import os from "os";
import path from "path";

import { Effect, Layer } from "effect";

import { AppConfigTag } from "~/core/config/app-config-port";
import {
  createEnvironmentPaths,
  createInstallPaths,
  createStatePaths,
  createWorkspacePaths,
  EnvironmentPathsTag,
  type EnvironmentPaths,
  InstallPathsTag,
  type InstallPaths,
  type PathRuntime,
  StatePathsTag,
  type StatePaths,
  WorkspacePathsTag,
  type WorkspacePaths,
} from "~/core/runtime/path-service";

export const resolvePathRuntime = (overrides: Partial<PathRuntime> = {}): PathRuntime => {
  const homeDir = overrides.homeDir ?? os.homedir();

  return {
    homeDir,
    cwd: overrides.cwd ?? process.cwd(),
    xdgConfigHome: overrides.xdgConfigHome ?? process.env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config"),
    argv: overrides.argv ?? [...process.argv],
    execPath: overrides.execPath ?? process.execPath,
    devInstallDir: overrides.devInstallDir ?? process.env.DEV_INSTALL_DIR,
    devStateDir: overrides.devStateDir ?? process.env.DEV_STATE_DIR,
  };
};

export const createEnvironmentPathsLive = (runtime = resolvePathRuntime()): EnvironmentPaths => createEnvironmentPaths(runtime);

export const createEnvironmentPathsLiveLayer = () => Layer.succeed(EnvironmentPathsTag, createEnvironmentPathsLive());

export const createInstallPathsLive = (runtime = resolvePathRuntime()): InstallPaths => createInstallPaths(runtime);

export const createInstallPathsLiveLayer = () => Layer.succeed(InstallPathsTag, createInstallPathsLive());

export const createStatePathsLive = (
  options: {
    readonly stateDir?: string;
    readonly configPath?: string;
  } = {},
  runtime = resolvePathRuntime(),
): StatePaths => createStatePaths(runtime, options);

export const createStatePathsLiveLayer = (configPath?: string) =>
  Layer.succeed(
    StatePathsTag,
    createStatePathsLive({
      configPath,
    }),
  );

export const createWorkspacePathsLive = (environmentPaths: EnvironmentPaths, baseSearchPath?: string): WorkspacePaths =>
  createWorkspacePaths(environmentPaths, baseSearchPath);

export const WorkspacePathsLiveLayer = Layer.effect(
  WorkspacePathsTag,
  Effect.gen(function* () {
    const config = yield* AppConfigTag;
    const environmentPaths = yield* EnvironmentPathsTag;
    return createWorkspacePathsLive(environmentPaths, config.baseSearchPath);
  }),
);
