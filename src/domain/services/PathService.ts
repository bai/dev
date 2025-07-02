import os from "os";
import path from "path";

import { Context, Effect, Layer } from "effect";

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

export class PathServiceImpl implements PathService {
  readonly homeDir = DEFAULT_HOME_DIR;
  readonly devDir = path.join(this.homeDir, DEFAULT_DEV_DIR);
  readonly configDir = path.join(XDG_CONFIG_HOME, "dev");
  readonly configPath = path.join(this.configDir, "config.json");
  readonly dataDir = path.join(XDG_DATA_HOME, "dev");
  readonly dbPath = path.join(this.dataDir, "dev.db");
  readonly cacheDir = path.join(XDG_CACHE_HOME, "dev");

  get baseSearchDir(): string {
    return path.join(this.homeDir, DEFAULT_BASE_SEARCH_DIR);
  }

  getBasePath(config: Config): string {
    // Use config path if provided, otherwise default
    return config.paths?.base ? path.resolve(config.paths.base.replace(/^~/, this.homeDir)) : this.baseSearchDir;
  }
}

// Service tag for Effect Context system
export class PathServiceTag extends Context.Tag("PathService")<PathServiceTag, PathService>() {}

// Layer that provides PathService
export const PathServiceLive = Layer.succeed(PathServiceTag, new PathServiceImpl());
