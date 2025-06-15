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
    .default("https://raw.githubusercontent.com/bai/dev/main/hack/example-dev-config.json")
    .describe("URL to the dev config file, set to whatever URL was used to install dev"),

  defaultOrg: z.string().default("bai").describe("Default organization to use for cloning repositories"),

  orgToProvider: z
    .record(z.string(), gitProviderSchema)
    .default({ "gitlab-org": "gitlab" })
    .describe("Map of organizations to their preferred git provider"),

  mise: miseConfigSchema.optional().describe("Mise configuration settings"),
});

export type DevConfig = z.infer<typeof devConfigSchema>;

class ConfigError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Unified configuration manager that handles both dev config file management
 * and provides a generic key-value configuration interface
 */
class DevConfigManager implements ConfigManager {
  private static instance: DevConfigManager;
  private cachedDevConfig: DevConfig | null = null;
  private runtimeConfig: Record<string, any> = {};
  private configLoaded = false;

  private constructor() {
    // Private constructor enforces singleton pattern
  }

  static getInstance(): DevConfigManager {
    if (!DevConfigManager.instance) {
      DevConfigManager.instance = new DevConfigManager();
    }
    return DevConfigManager.instance;
  }

  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(devConfigDir)) {
        fs.mkdirSync(devConfigDir, { recursive: true });
      }

      if (!fs.existsSync(devConfigPath)) {
        const result = devConfigSchema.safeParse({});
        if (!result.success) {
          throw new ConfigError(
            `Default config creation failed: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
            result.error,
          );
        }

        const defaultConfig = result.data;
        fs.writeFileSync(devConfigPath, JSON.stringify(defaultConfig, null, 2));
      }
    } catch (error) {
      throw new ConfigError("Failed to ensure config exists", error);
    }
  }

  /**
   * Load the dev config file and merge with runtime configuration
   */
  private loadConfig(): void {
    if (this.configLoaded) return;

    try {
      const devConfig = this.getDevConfig();
      this.runtimeConfig = {
        // Dev-specific config
        "dev.configUrl": devConfig.configUrl,
        "dev.defaultOrg": devConfig.defaultOrg,
        "dev.orgToProvider": devConfig.orgToProvider,
        "dev.mise.trustedConfigPaths": devConfig.mise?.settings?.trusted_config_paths || [],

        // Environment variables as config
        "env.home": process.env.HOME,
        "env.user": process.env.USER,
        "env.shell": process.env.SHELL,
        "env.debug": isDebugMode(),
      };

      this.configLoaded = true;
    } catch (error) {
      logger.warn("Failed to load dev configuration, using defaults");
      this.runtimeConfig = {};
      this.configLoaded = true;
    }
  }

  /**
   * Get the raw dev configuration from file
   */
  getDevConfig(): DevConfig {
    if (this.cachedDevConfig) {
      return this.cachedDevConfig;
    }

    this.ensureConfigExists();

    try {
      const jsonText = fs.readFileSync(devConfigPath, "utf-8");
      const parsedJson = JSON.parse(jsonText);

      const result = devConfigSchema.safeParse(parsedJson);
      if (!result.success) {
        throw new ConfigError(
          `Invalid config schema: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
          result.error,
        );
      }

      this.cachedDevConfig = result.data;

      // Debug logging
      if (isDebugMode()) {
        logger.info("🔍 Dev Config (Debug Mode):\n" + JSON.stringify(this.cachedDevConfig, null, 2));
      }

      return this.cachedDevConfig;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ConfigError(`Invalid JSON in config file: ${devConfigPath}`, error);
      }
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError("Failed to load config", error);
    }
  }

  /**
   * ConfigManager interface implementation: Get configuration value with dot notation support
   */
  get<T = any>(key: string, defaultValue?: T): T {
    this.loadConfig();

    // Support nested key access with dot notation
    const keys = key.split(".");
    let value: any = this.runtimeConfig;

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return defaultValue as T;
      }
    }

    return value ?? defaultValue;
  }

  /**
   * ConfigManager interface implementation: Set configuration value with dot notation support
   */
  set(key: string, value: any): void {
    this.loadConfig();

    // Support nested key setting with dot notation
    const keys = key.split(".");
    const lastKey = keys.pop();
    let target = this.runtimeConfig;

    for (const k of keys) {
      if (!target[k] || typeof target[k] !== "object") {
        target[k] = {};
      }
      target = target[k];
    }

    if (lastKey !== undefined) {
      target[lastKey] = value;
    }
  }

  /**
   * ConfigManager interface implementation: Check if configuration key exists
   */
  has(key: string): boolean {
    this.loadConfig();

    const keys = key.split(".");
    let value: any = this.runtimeConfig;

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return false;
      }
    }

    return value !== undefined;
  }

  /**
   * ConfigManager interface implementation: Get all configuration
   */
  getAll(): Record<string, any> {
    this.loadConfig();
    return { ...this.runtimeConfig };
  }

  /**
   * Get all configuration for a specific namespace
   */
  getNamespace(namespace: string): Record<string, any> {
    this.loadConfig();

    const result: Record<string, any> = {};
    const prefix = `${namespace}.`;

    for (const [key, value] of Object.entries(this.runtimeConfig)) {
      if (key.startsWith(prefix)) {
        const shortKey = key.substring(prefix.length);
        result[shortKey] = value;
      }
    }

    return result;
  }

  /**
   * Merge additional configuration into runtime config
   */
  merge(additionalConfig: Record<string, any>): void {
    this.loadConfig();
    Object.assign(this.runtimeConfig, additionalConfig);
  }

  /**
   * Clear all configuration (mainly for testing)
   */
  clear(): void {
    this.runtimeConfig = {};
    this.configLoaded = false;
    this.cachedDevConfig = null;
  }

  /**
   * Reload configuration from source
   */
  reload(): void {
    this.configLoaded = false;
    this.cachedDevConfig = null;
    this.loadConfig();
  }

  /**
   * Refresh dev configuration from remote URL
   */
  async refreshFromRemote(): Promise<void> {
    logger.info("🔄 Refreshing dev configuration...");

    const currentConfig = this.getDevConfig();
    const { configUrl } = currentConfig;

    try {
      const response = await fetch(configUrl);

      if (!response.ok) {
        throw new ConfigError(
          `Failed to fetch remote config from ${configUrl}: ${response.status} ${response.statusText}`,
        );
      }

      const configText = await response.text();

      // Validate the remote config before saving
      const remoteConfig = JSON.parse(configText);
      const result = devConfigSchema.safeParse(remoteConfig);

      if (!result.success) {
        throw new ConfigError(
          `Remote config validation failed: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
          result.error,
        );
      }

      const validatedConfig = result.data;

      // Write the validated config
      await Bun.write(devConfigPath, JSON.stringify(validatedConfig, null, 2));

      // Invalidate caches and reload
      this.cachedDevConfig = null;
      this.configLoaded = false;

      logger.info("✅ Dev configuration refreshed successfully");
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new ConfigError("Remote config contains invalid JSON", error);
      }
      throw new ConfigError("Failed to refresh config from remote", error);
    }
  }

  /**
   * Update the dev configuration file
   */
  async updateDevConfig(updates: Partial<DevConfig>): Promise<void> {
    const currentConfig = this.getDevConfig();
    const newConfig = { ...currentConfig, ...updates };

    const result = devConfigSchema.safeParse(newConfig);
    if (!result.success) {
      throw new ConfigError(
        `Config update validation failed: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
        result.error,
      );
    }

    const validatedConfig = result.data;

    await Bun.write(devConfigPath, JSON.stringify(validatedConfig, null, 2));
    this.cachedDevConfig = validatedConfig;

    // Reload runtime config to reflect changes
    this.configLoaded = false;
    this.loadConfig();
  }

  /**
   * Clear dev config cache
   */
  clearDevConfigCache(): void {
    this.cachedDevConfig = null;
    this.configLoaded = false;
  }
}

const configManager = DevConfigManager.getInstance();

// Export the unified config manager instance
export function createConfig(): ConfigManager {
  return configManager;
}

// Legacy API compatibility - dev config specific functions
export function getDevConfig(): DevConfig {
  return configManager.getDevConfig();
}

export async function refreshDevConfigFromRemoteUrl(): Promise<void> {
  return configManager.refreshFromRemote();
}

// Maintain backward compatibility
export const devConfig = getDevConfig();
