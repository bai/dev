import fs from "fs";

import { z } from "zod/v4";

import { devConfigDir, devConfigPath } from "~/lib/constants";
import type { ConfigManager } from "~/lib/core/command-types";
import { isDebugMode } from "~/lib/is-debug-mode";
import { logger } from "~/lib/logger";
import { miseConfigSchema } from "~/lib/tools/mise";

const gitProviderSchema = z.enum(["github", "gitlab"]);

export const devConfigSchema = z.object({
  configUrl: z
    .url()
    .default("https://raw.githubusercontent.com/bai/dev/main/docs/examples/configs/example.json")
    .describe("URL to the dev config file, set to whatever URL was used to install dev"),

  defaultOrg: z.string().default("bai").describe("Default organization to use for cloning repositories"),

  orgToProvider: z
    .record(z.string(), gitProviderSchema)
    .default({ "gitlab-org": "gitlab" })
    .describe("Map of organizations to their preferred git provider"),

  miseGlobalConfig: miseConfigSchema.optional().describe("Mise global configuration settings"),
  miseRepoConfig: miseConfigSchema.optional().describe("Mise repository configuration settings"),
});

export type DevConfig = z.infer<typeof devConfigSchema>;

/**
 * Factory function to create ConfigError
 */
export const createConfigError = (message: string, cause?: unknown): Error & { cause?: unknown } => {
  const error = new Error(message) as Error & { cause?: unknown };
  error.name = "ConfigError";
  error.cause = cause;
  return error;
};

/**
 * Type guard to check if an error is a ConfigError
 */
export const isConfigError = (error: any): error is Error & { cause?: unknown } => {
  return error && error.name === "ConfigError";
};

/**
 * Internal state for the config manager (module-level encapsulation)
 */
const createConfigState = () => {
  let cachedDevConfig: DevConfig | null = null;
  let runtimeConfig: Record<string, any> = {};
  let configLoaded = false;

  return {
    getCachedDevConfig: () => cachedDevConfig,
    setCachedDevConfig: (config: DevConfig | null) => {
      cachedDevConfig = config;
    },
    getRuntimeConfig: () => runtimeConfig,
    setRuntimeConfig: (config: Record<string, any>) => {
      runtimeConfig = config;
    },
    isConfigLoaded: () => configLoaded,
    setConfigLoaded: (loaded: boolean) => {
      configLoaded = loaded;
    },
    clearState: () => {
      cachedDevConfig = null;
      runtimeConfig = {};
      configLoaded = false;
    },
  };
};

// Module-level state
const configState = createConfigState();

/**
 * Ensure config directory and file exist
 */
const ensureConfigExists = (): void => {
  try {
    if (!fs.existsSync(devConfigDir)) {
      fs.mkdirSync(devConfigDir, { recursive: true });
    }

    if (!fs.existsSync(devConfigPath)) {
      const result = devConfigSchema.safeParse({});
      if (!result.success) {
        throw createConfigError(
          `Default config creation failed: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
          result.error,
        );
      }

      const defaultConfig = result.data;
      fs.writeFileSync(devConfigPath, JSON.stringify(defaultConfig, null, 2));
    }
  } catch (error) {
    throw createConfigError("Failed to ensure config exists", error);
  }
};

/**
 * Load the dev config file and merge with runtime configuration
 */
const loadConfig = (): void => {
  if (configState.isConfigLoaded()) return;

  try {
    const devConfig = getDevConfig();
    const runtimeConfig = {
      // Dev-specific config
      "dev.configUrl": devConfig.configUrl,
      "dev.defaultOrg": devConfig.defaultOrg,
      "dev.orgToProvider": devConfig.orgToProvider,
      "dev.miseGlobalConfig": devConfig.miseGlobalConfig,
      "dev.miseRepoConfig": devConfig.miseRepoConfig,

      // Environment variables as config
      "env.home": process.env.HOME,
      "env.user": process.env.USER,
      "env.shell": process.env.SHELL,
      "env.debug": isDebugMode(),
    };

    configState.setRuntimeConfig(runtimeConfig);
    configState.setConfigLoaded(true);
  } catch (error) {
    logger.warn("Failed to load dev configuration, using defaults");
    configState.setRuntimeConfig({});
    configState.setConfigLoaded(true);
  }
};

/**
 * Get the raw dev configuration from file
 */
export const getDevConfig = (): DevConfig => {
  const cached = configState.getCachedDevConfig();
  if (cached) {
    return cached;
  }

  ensureConfigExists();

  try {
    const jsonText = fs.readFileSync(devConfigPath, "utf-8");
    const parsedJson = JSON.parse(jsonText);

    const result = devConfigSchema.safeParse(parsedJson);
    if (!result.success) {
      throw createConfigError(
        `Invalid config schema: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
        result.error,
      );
    }

    const devConfig = result.data;
    configState.setCachedDevConfig(devConfig);

    // Debug logging
    if (isDebugMode()) {
      logger.debug("🔍 Dev Config:\n" + JSON.stringify(devConfig, null, 2));
    }

    return devConfig;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw createConfigError(`Invalid JSON in config file: ${devConfigPath}`, error);
    }
    if (isConfigError(error)) {
      throw error;
    }
    throw createConfigError("Failed to load config", error);
  }
};

/**
 * Get configuration value with dot notation support
 */
const get = <T = any>(key: string, defaultValue?: T): T => {
  loadConfig();

  // Support nested key access with dot notation
  const keys = key.split(".");
  let value: any = configState.getRuntimeConfig();

  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      return defaultValue as T;
    }
  }

  return value ?? defaultValue;
};

/**
 * Set configuration value with dot notation support
 */
const set = (key: string, value: any): void => {
  loadConfig();

  // Support nested key setting with dot notation
  const keys = key.split(".");
  const lastKey = keys.pop();
  const runtimeConfig = configState.getRuntimeConfig();
  let target = runtimeConfig;

  for (const k of keys) {
    if (!target[k] || typeof target[k] !== "object") {
      target[k] = {};
    }
    target = target[k];
  }

  if (lastKey !== undefined) {
    target[lastKey] = value;
  }

  configState.setRuntimeConfig(runtimeConfig);
};

/**
 * Check if configuration key exists
 */
const has = (key: string): boolean => {
  loadConfig();

  const keys = key.split(".");
  let value: any = configState.getRuntimeConfig();

  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      return false;
    }
  }

  return value !== undefined;
};

/**
 * Get all configuration
 */
const getAll = (): Record<string, any> => {
  loadConfig();
  return { ...configState.getRuntimeConfig() };
};

/**
 * Get all configuration for a specific namespace
 */
const getNamespace = (namespace: string): Record<string, any> => {
  loadConfig();

  const result: Record<string, any> = {};
  const prefix = `${namespace}.`;
  const runtimeConfig = configState.getRuntimeConfig();

  for (const [key, value] of Object.entries(runtimeConfig)) {
    if (key.startsWith(prefix)) {
      const shortKey = key.substring(prefix.length);
      result[shortKey] = value;
    }
  }

  return result;
};

/**
 * Merge additional configuration into runtime config
 */
const merge = (additionalConfig: Record<string, any>): void => {
  loadConfig();
  const currentConfig = configState.getRuntimeConfig();
  const mergedConfig = Object.assign(currentConfig, additionalConfig);
  configState.setRuntimeConfig(mergedConfig);
};

/**
 * Clear all configuration (mainly for testing)
 */
const clear = (): void => {
  configState.clearState();
};

/**
 * Reload configuration from source
 */
const reload = (): void => {
  configState.setConfigLoaded(false);
  configState.setCachedDevConfig(null);
  loadConfig();
};

/**
 * Refresh dev configuration from remote URL
 */
export const refreshDevConfigFromRemoteUrl = async (): Promise<void> => {
  logger.info("🔄 Refreshing dev configuration...");

  const currentConfig = getDevConfig();
  const { configUrl } = currentConfig;

  try {
    const response = await fetch(configUrl);

    if (!response.ok) {
      throw createConfigError(
        `Failed to fetch remote config from ${configUrl}: ${response.status} ${response.statusText}`,
      );
    }

    const configText = await response.text();

    // Validate the remote config before saving
    const remoteConfig = JSON.parse(configText);
    const result = devConfigSchema.safeParse(remoteConfig);

    if (!result.success) {
      throw createConfigError(
        `Remote config validation failed: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
        result.error,
      );
    }

    const validatedConfig = result.data;

    // Write the validated config
    await Bun.write(devConfigPath, JSON.stringify(validatedConfig, null, 2));

    // Invalidate caches and reload
    configState.setCachedDevConfig(null);
    configState.setConfigLoaded(false);

    logger.info("✅ Dev configuration refreshed successfully");
  } catch (error) {
    if (isConfigError(error)) {
      throw error;
    }
    if (error instanceof SyntaxError) {
      throw createConfigError("Remote config contains invalid JSON", error);
    }
    throw createConfigError("Failed to refresh config from remote", error);
  }
};

/**
 * Update the dev configuration file
 */
export const updateDevConfig = async (updates: Partial<DevConfig>): Promise<void> => {
  const currentConfig = getDevConfig();
  const newConfig = { ...currentConfig, ...updates };

  const result = devConfigSchema.safeParse(newConfig);
  if (!result.success) {
    throw createConfigError(
      `Config update validation failed: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
      result.error,
    );
  }

  const validatedConfig = result.data;

  await Bun.write(devConfigPath, JSON.stringify(validatedConfig, null, 2));
  configState.setCachedDevConfig(validatedConfig);

  // Reload runtime config to reflect changes
  configState.setConfigLoaded(false);
  loadConfig();
};

/**
 * Clear dev config cache
 */
export const clearDevConfigCache = (): void => {
  configState.setCachedDevConfig(null);
  configState.setConfigLoaded(false);
};

/**
 * Create a config manager instance with functional interface
 */
export const createConfig = (): ConfigManager => ({
  get,
  set,
  has,
  getAll,
});

/**
 * Functional config manager for advanced operations
 */
export const configManager = {
  get,
  set,
  has,
  getAll,
  getNamespace,
  merge,
  clear,
  reload,
  getDevConfig,
  refreshFromRemote: refreshDevConfigFromRemoteUrl,
  updateDevConfig,
  clearDevConfigCache,
};

// Maintain backward compatibility
export const devConfig = getDevConfig();
