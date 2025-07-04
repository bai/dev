import os from "os";
import path from "path";

import { Effect, Layer } from "effect";

import { PathServiceLive } from "../domain/services/PathService";
import { FileSystemLiveLayer } from "../infra/fs/FileSystemLive";
import { NetworkLiveLayer } from "../infra/network/NetworkLive";
import { ConfigLoaderLiveLayer, ConfigLoaderService } from "./loader";
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
  PathServiceLive,
  FileSystemLiveLayer,
  Layer.provide(NetworkLiveLayer, FileSystemLiveLayer),
  Layer.provide(
    ConfigLoaderLiveLayer(path.join(os.homedir(), ".config", "dev", "config.json")),
    Layer.mergeAll(PathServiceLive, FileSystemLiveLayer, Layer.provide(NetworkLiveLayer, FileSystemLiveLayer)),
  ),
);

/**
 * Load configuration as the first stage of application bootstrap
 * This runs before any other layers are composed
 */
export const loadConfiguration = () =>
  Effect.gen(function* () {
    yield* Effect.logDebug("🔧 Stage 1: Loading configuration...");

    const configLoader = yield* ConfigLoaderService;
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
}

/**
 * Extract the values needed for dynamic layer composition
 */
export const extractDynamicValues = (config: Config): DynamicConfigValues => ({
  defaultOrg: config.defaultOrg,
  configPath: path.join(os.homedir(), ".config", "dev", "config.json"),
  logLevel: config.logLevel ?? "info",
  baseSearchPath: config.paths.base,
});
