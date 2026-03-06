import os from "os";
import path from "path";

import { Layer } from "effect";

import { createPathService, PathServiceTag, type PathService, type PathServiceRuntime } from "../domain/path-service";

export const resolvePathServiceRuntime = (overrides: Partial<PathServiceRuntime> = {}): PathServiceRuntime => {
  const homeDir = overrides.homeDir ?? os.homedir();

  return {
    homeDir,
    xdgConfigHome: overrides.xdgConfigHome ?? process.env.XDG_CONFIG_HOME ?? path.join(homeDir, ".config"),
    xdgDataHome: overrides.xdgDataHome ?? process.env.XDG_DATA_HOME ?? path.join(homeDir, ".local", "share"),
    xdgCacheHome: overrides.xdgCacheHome ?? process.env.XDG_CACHE_HOME ?? path.join(homeDir, ".cache"),
    cwd: overrides.cwd ?? process.cwd(),
  };
};

export const createPathServiceLive = (baseSearchPath?: string, runtime = resolvePathServiceRuntime()): PathService =>
  createPathService(runtime, baseSearchPath);

export const createPathServiceLiveLayer = (baseSearchPath?: string) => Layer.succeed(PathServiceTag, createPathServiceLive(baseSearchPath));
