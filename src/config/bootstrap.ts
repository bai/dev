import os from "os";
import path from "path";

import { Effect, Layer } from "effect";

import { PathServiceLiveLayer } from "../domain/path-service";
import { FileSystemLiveLayer } from "../infra/file-system-live";
import { NetworkLiveLayer } from "../infra/network-live";
import { ConfigLoaderLiveLayer, ConfigLoaderTag } from "./loader";
import { type Config } from "./schema";

/**
 * Stage 1: Bootstrap Configuration Loader
 *
 * This creates a minimal program that loads configuration without any
 * dependencies on services that need the configuration themselves.
 *
 * This stage only loads the essential services needed to read config:
 * - FileSystem (for reading config file)
 * - Network (for fetching remote config)
 * - PathService (for resolving paths)
 */

// Minimal layer for configuration bootstrap
const BootstrapLayer = Layer.mergeAll(
  PathServiceLiveLayer,
  FileSystemLiveLayer,
  Layer.provide(NetworkLiveLayer, FileSystemLiveLayer),
  Layer.provide(
    ConfigLoaderLiveLayer(path.join(os.homedir(), ".config", "dev", "config.json")),
    Layer.mergeAll(PathServiceLiveLayer, FileSystemLiveLayer, Layer.provide(NetworkLiveLayer, FileSystemLiveLayer)),
  ),
);

/**
 * Load configuration as the first stage of application bootstrap
 * This runs before any other layers are composed
 */
export const loadConfiguration = () =>
  Effect.gen(function* () {
    yield* Effect.logDebug("🔧 Stage 1: Loading configuration...");

    const configLoader = yield* ConfigLoaderTag;
    const config = yield* configLoader.load();

    yield* Effect.logDebug(`✅ Configuration loaded successfully (org: ${config.defaultOrg})`);
    return config;
  }).pipe(Effect.provide(BootstrapLayer));

/**
 * Configuration values extracted for dynamic layer composition
 */
export interface DynamicConfigValues {
  readonly defaultOrg: string;
  readonly configPath: string;
  readonly logLevel: string;
  readonly baseSearchPath: string;
  readonly defaultProvider: "github" | "gitlab";
  readonly orgToProvider: Record<string, "github" | "gitlab">;
}

/**
 * Expands tilde in file paths - pure function for config processing
 */
const expandTildePath = (filePath: string): string => {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (filePath === "~") {
    return os.homedir();
  }
  return path.resolve(filePath);
};

/**
 * Extract the values needed for dynamic layer composition
 */
export const extractDynamicValues = (config: Config): DynamicConfigValues => ({
  defaultOrg: config.defaultOrg,
  configPath: path.join(os.homedir(), ".config", "dev", "config.json"),
  logLevel: config.logLevel ?? "info",
  baseSearchPath: expandTildePath(config.baseSearchPath ?? path.join(os.homedir(), "src")),
  defaultProvider: config.defaultProvider ?? "github",
  orgToProvider: config.orgToProvider ?? {},
});
