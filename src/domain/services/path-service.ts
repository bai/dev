import os from "os";
import path from "path";

import { Context, Layer } from "effect";

import type { Config } from "../models";

// Pure constants - no side effects
export const DEFAULT_HOME_DIR = os.homedir();
export const DEFAULT_BASE_SEARCH_DIR = "src";
export const DEFAULT_DEV_DIR = ".dev";

// XDG Base Directory Specification compliant paths
export const XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME || path.join(DEFAULT_HOME_DIR, ".config");
export const XDG_DATA_HOME = process.env.XDG_DATA_HOME || path.join(DEFAULT_HOME_DIR, ".local", "share");
export const XDG_CACHE_HOME = process.env.XDG_CACHE_HOME || path.join(DEFAULT_HOME_DIR, ".cache");

// Path service interface - pure domain logic for path handling
export interface PathService {
  readonly homeDir: string;
  readonly baseSearchDir: string;
  readonly devDir: string;
  readonly configDir: string;
  readonly configPath: string;
  readonly dataDir: string;
  readonly dbPath: string;
  readonly cacheDir: string;
  getBasePath(config: Config): string;
}

// Individual functions for each method
const getBasePath = (config: Config): string => {
  // Default base search path since paths.base is no longer in config
  return path.join(DEFAULT_HOME_DIR, DEFAULT_BASE_SEARCH_DIR);
};

// Plain object implementation
export const PathLive: PathService = {
  homeDir: DEFAULT_HOME_DIR,
  devDir: path.join(DEFAULT_HOME_DIR, DEFAULT_DEV_DIR),
  configDir: path.join(XDG_CONFIG_HOME, "dev"),
  configPath: path.join(XDG_CONFIG_HOME, "dev", "config.json"),
  dataDir: path.join(XDG_DATA_HOME, "dev"),
  dbPath: path.join(XDG_DATA_HOME, "dev", "dev.db"),
  cacheDir: path.join(XDG_CACHE_HOME, "dev"),
  get baseSearchDir(): string {
    return path.join(DEFAULT_HOME_DIR, DEFAULT_BASE_SEARCH_DIR);
  },
  getBasePath,
};

// Service tag for Effect Context system
export class PathServiceTag extends Context.Tag("PathService")<PathServiceTag, PathService>() {}

// Layer that provides PathService
export const PathLiveLayer = Layer.succeed(PathServiceTag, PathLive);
