import os from "os";
import path from "path";

import { Effect, Layer } from "effect";

import { AppConfigTag } from "~/core/config/app-config-port";
import {
  createHostPaths,
  createWorkspacePaths,
  HostPathsTag,
  type HostPaths,
  type HostPathsRuntime,
  WorkspacePathsTag,
  type WorkspacePaths,
} from "~/core/runtime/path-service";

export const resolveHostPathsRuntime = (overrides: Partial<HostPathsRuntime> = {}): HostPathsRuntime => {
  const homeDir = overrides.homeDir ?? os.homedir();

  return {
    homeDir,
    xdgConfigHome: overrides.xdgConfigHome ?? process.env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config"),
    xdgDataHome: overrides.xdgDataHome ?? process.env.XDG_DATA_HOME ?? path.join(homeDir, ".local", "share"),
    xdgCacheHome: overrides.xdgCacheHome ?? process.env.XDG_CACHE_HOME ?? path.join(homeDir, ".cache"),
    cwd: overrides.cwd ?? process.cwd(),
  };
};

export const createHostPathsLive = (configPath?: string, runtime = resolveHostPathsRuntime()): HostPaths =>
  createHostPaths(runtime, { configPath });

export const createHostPathsLiveLayer = (configPath?: string) => Layer.succeed(HostPathsTag, createHostPathsLive(configPath));

export const createWorkspacePathsLive = (hostPaths: HostPaths, baseSearchPath?: string): WorkspacePaths =>
  createWorkspacePaths(hostPaths, baseSearchPath);

export const WorkspacePathsLiveLayer = Layer.effect(
  WorkspacePathsTag,
  Effect.gen(function* () {
    const config = yield* AppConfigTag;
    const hostPaths = yield* HostPathsTag;
    return createWorkspacePathsLive(hostPaths, config.baseSearchPath);
  }),
);
