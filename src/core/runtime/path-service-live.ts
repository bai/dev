import os from "os";
import path from "path";

import { Effect, Layer } from "effect";

import { AppConfig } from "~/core/config/app-config-port";
import {
  createEnvironmentPaths,
  createInstallPaths,
  createStatePaths,
  createWorkspacePaths,
  EnvironmentPaths,
  type EnvironmentPathsService,
  InstallPaths,
  type InstallPathsService,
  type PathRuntime,
  StatePaths,
  type StatePathsService,
  WorkspacePaths,
  type WorkspacePathsService,
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

export const createEnvironmentPathsLive = (runtime = resolvePathRuntime()): EnvironmentPathsService => createEnvironmentPaths(runtime);

export const createEnvironmentPathsLiveLayer = () => Layer.succeed(EnvironmentPaths, createEnvironmentPathsLive());

export const createInstallPathsLive = (runtime = resolvePathRuntime()): InstallPathsService => createInstallPaths(runtime);

export const createInstallPathsLiveLayer = () => Layer.succeed(InstallPaths, createInstallPathsLive());

export const createStatePathsLive = (
  options: {
    readonly stateDir?: string;
    readonly configPath?: string;
  } = {},
  runtime = resolvePathRuntime(),
): StatePathsService => createStatePaths(runtime, options);

export const createStatePathsLiveLayer = (configPath?: string) =>
  Layer.succeed(
    StatePaths,
    createStatePathsLive({
      configPath,
    }),
  );

export const createWorkspacePathsLive = (environmentPaths: EnvironmentPathsService, baseSearchPath?: string): WorkspacePathsService =>
  createWorkspacePaths(environmentPaths, baseSearchPath);

export const WorkspacePathsLiveLayer = Layer.effect(
  WorkspacePaths,
  Effect.gen(function* () {
    const config = yield* AppConfig;
    const environmentPaths = yield* EnvironmentPaths;
    return createWorkspacePathsLive(environmentPaths, config.baseSearchPath);
  }),
);
