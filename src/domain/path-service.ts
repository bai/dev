import path from "path";

import { Effect } from "effect";

import type { Config } from "./config-schema";

export const DEFAULT_BASE_SEARCH_DIR = "src";
const DEFAULT_DEV_DIR = ".dev";

export interface PathServiceRuntime {
  readonly homeDir: string;
  readonly xdgConfigHome: string;
  readonly xdgDataHome: string;
  readonly xdgCacheHome: string;
  readonly cwd: string;
}

export interface PathService {
  readonly homeDir: string;
  readonly baseSearchPath: string;
  readonly devDir: string;
  readonly configDir: string;
  readonly configPath: string;
  readonly dataDir: string;
  readonly dbPath: string;
  readonly cacheDir: string;
  getBasePath(config: Config): string;
}

export const resolveUserPath = (filePath: string, runtime: Pick<PathServiceRuntime, "homeDir" | "cwd">): string => {
  if (filePath.startsWith("~/")) {
    return path.join(runtime.homeDir, filePath.slice(2));
  }
  if (filePath === "~") {
    return runtime.homeDir;
  }
  return path.resolve(runtime.cwd, filePath);
};

const getBasePath = (config: Config, runtime: PathServiceRuntime): string =>
  resolveUserPath(config.baseSearchPath ?? path.join(runtime.homeDir, DEFAULT_BASE_SEARCH_DIR), runtime);

export const createPathService = (runtime: PathServiceRuntime, baseSearchPath?: string): PathService => {
  const resolvedBaseSearchPath =
    baseSearchPath === undefined ? path.join(runtime.homeDir, DEFAULT_BASE_SEARCH_DIR) : resolveUserPath(baseSearchPath, runtime);

  return {
    homeDir: runtime.homeDir,
    devDir: path.join(runtime.homeDir, DEFAULT_DEV_DIR),
    configDir: path.join(runtime.xdgConfigHome, "dev"),
    configPath: path.join(runtime.xdgConfigHome, "dev", "config.json"),
    dataDir: path.join(runtime.xdgDataHome, "dev"),
    dbPath: path.join(runtime.xdgDataHome, "dev", "dev.db"),
    cacheDir: path.join(runtime.xdgCacheHome, "dev"),
    baseSearchPath: resolvedBaseSearchPath,
    getBasePath: (config) => getBasePath(config, runtime),
  };
};

export class PathServiceTag extends Effect.Tag("PathService")<PathServiceTag, PathService>() {}
