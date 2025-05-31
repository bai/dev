import type { ConfigManager } from "~/lib/core/command-types";
import { getDevConfig } from "~/lib/dev-config";

/**
 * Configuration manager implementation
 */
export class DevConfigManager implements ConfigManager {
  private config: Record<string, any> = {};
  private loaded = false;

  /**
   * Lazy load the configuration
   */
  private loadConfig(): void {
    if (this.loaded) return;

    try {
      const devConfig = getDevConfig();
      this.config = {
        // Dev-specific config
        "dev.configUrl": devConfig.configUrl,
        "dev.defaultOrg": devConfig.defaultOrg,
        "dev.orgToProvider": devConfig.orgToProvider,
        "dev.mise.trustedConfigPaths": devConfig.mise?.settings?.trusted_config_paths || [],

        // Environment variables as config
        "env.home": process.env.HOME,
        "env.user": process.env.USER,
        "env.shell": process.env.SHELL,
        "env.debug": process.env.DEBUG === "true",

        // CLI-specific config
        "cli.name": "dev",
        "cli.version": "1.0.0",
        "cli.helpStyle": "detailed",
      };

      this.loaded = true;
    } catch (error) {
      console.warn("Failed to load dev configuration, using defaults");
      this.config = {};
      this.loaded = true;
    }
  }

  get<T = any>(key: string, defaultValue?: T): T {
    this.loadConfig();

    // Support nested key access with dot notation
    const keys = key.split(".");
    let value: any = this.config;

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return defaultValue as T;
      }
    }

    return value ?? defaultValue;
  }

  set(key: string, value: any): void {
    this.loadConfig();

    // Support nested key setting with dot notation
    const keys = key.split(".");
    const lastKey = keys.pop()!;
    let target = this.config;

    for (const k of keys) {
      if (!target[k] || typeof target[k] !== "object") {
        target[k] = {};
      }
      target = target[k];
    }

    target[lastKey] = value;
  }

  has(key: string): boolean {
    this.loadConfig();

    const keys = key.split(".");
    let value: any = this.config;

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        return false;
      }
    }

    return value !== undefined;
  }

  getAll(): Record<string, any> {
    this.loadConfig();
    return { ...this.config };
  }

  /**
   * Get all configuration for a specific namespace
   */
  getNamespace(namespace: string): Record<string, any> {
    this.loadConfig();

    const result: Record<string, any> = {};
    const prefix = `${namespace}.`;

    for (const [key, value] of Object.entries(this.config)) {
      if (key.startsWith(prefix)) {
        const shortKey = key.substring(prefix.length);
        result[shortKey] = value;
      }
    }

    return result;
  }

  /**
   * Merge additional configuration
   */
  merge(additionalConfig: Record<string, any>): void {
    this.loadConfig();
    Object.assign(this.config, additionalConfig);
  }

  /**
   * Clear all configuration (mainly for testing)
   */
  clear(): void {
    this.config = {};
    this.loaded = false;
  }

  /**
   * Reload configuration from source
   */
  reload(): void {
    this.loaded = false;
    this.loadConfig();
  }
}

/**
 * Create a configuration manager instance
 */
export function createConfig(): ConfigManager {
  return new DevConfigManager();
}
