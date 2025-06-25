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

// Simple caching
let cachedDevConfig: DevConfig | null = null;

/**
 * Ensure config directory and file exist
 */
const ensureConfigExists = (): void => {
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

    fs.writeFileSync(devConfigPath, JSON.stringify(result.data, null, 2));
  }
};

/**
 * Get the dev configuration from file
 */
export const getDevConfig = (): DevConfig => {
  if (cachedDevConfig) {
    return cachedDevConfig;
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

    cachedDevConfig = result.data;

    if (isDebugMode()) {
      logger.debug("🔍 Dev Config:\n" + JSON.stringify(cachedDevConfig, null, 2));
    }

    return cachedDevConfig;
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
    const remoteConfig = JSON.parse(configText);
    const result = devConfigSchema.safeParse(remoteConfig);

    if (!result.success) {
      throw createConfigError(
        `Remote config validation failed: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
        result.error,
      );
    }

    await Bun.write(devConfigPath, JSON.stringify(result.data, null, 2));
    cachedDevConfig = null; // Clear cache
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
 * Clear dev config cache (for testing)
 */
export const clearDevConfigCache = (): void => {
  cachedDevConfig = null;
};

/**
 * Simple ConfigManager implementation
 */
export const createConfig = (): ConfigManager => {
  const config = getDevConfig();

  return {
    get: <T = any>(key: string, defaultValue?: T): T => {
      // Simple key access - no complex dot notation needed
      const value = (config as any)[key];
      return value !== undefined ? value : (defaultValue as T);
    },
    set: () => {
      throw new Error("Config modification not supported in simple implementation");
    },
    has: (key: string): boolean => {
      return (config as any)[key] !== undefined;
    },
    getAll: (): Record<string, any> => ({ ...config }),
  };
};

// Export the config for backward compatibility
export const devConfig = getDevConfig();
