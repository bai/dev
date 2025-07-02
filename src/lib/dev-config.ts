import fs from "fs";

import { Effect } from "effect";
import { z } from "zod/v4";

import { devConfigDir, devConfigPath } from "~/lib/constants";
import { isDebugMode } from "~/lib/is-debug-mode";
import { logger } from "~/lib/logger";
import { miseConfigSchema } from "~/lib/tools/mise";

import { configError, type ConfigError } from "../domain/errors";
import type { ConfigManager } from "../domain/models";

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

// Simple caching
let cachedDevConfig: DevConfig | null = null;

/**
 * Ensure config directory and file exist
 */
const ensureConfigExists = (): Effect.Effect<void, ConfigError> => {
  return Effect.gen(function* () {
    if (!fs.existsSync(devConfigDir)) {
      yield* Effect.tryPromise({
        try: () => fs.promises.mkdir(devConfigDir, { recursive: true }),
        catch: (error: any) => configError(`Failed to create config directory: ${error.message}`),
      });
    }

    if (!fs.existsSync(devConfigPath)) {
      const result = devConfigSchema.safeParse({});
      if (!result.success) {
        return yield* Effect.fail(
          configError(
            `Default config creation failed: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
          ),
        );
      }

      yield* Effect.tryPromise({
        try: () => fs.promises.writeFile(devConfigPath, JSON.stringify(result.data, null, 2)),
        catch: (error: any) => configError(`Failed to write default config: ${error.message}`),
      });
    }
  });
};

/**
 * Get the dev configuration from file
 */
export const getDevConfig = (): Effect.Effect<DevConfig, ConfigError> => {
  return Effect.gen(function* () {
    if (cachedDevConfig) {
      return cachedDevConfig;
    }

    yield* ensureConfigExists();

    const jsonText = yield* Effect.tryPromise({
      try: () => fs.promises.readFile(devConfigPath, "utf-8"),
      catch: (error: any) => configError(`Failed to read config file: ${error.message}`),
    });

    const parsedJson = yield* Effect.tryPromise({
      try: () => Promise.resolve(JSON.parse(jsonText)),
      catch: (error: any) => configError(`Invalid JSON in config file: ${devConfigPath} - ${error.message}`),
    });

    const result = devConfigSchema.safeParse(parsedJson);
    if (!result.success) {
      return yield* Effect.fail(
        configError(
          `Invalid config schema: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
        ),
      );
    }

    cachedDevConfig = result.data;

    if (isDebugMode()) {
      logger.debug("🔍 Dev Config:\n" + JSON.stringify(cachedDevConfig, null, 2));
    }

    return cachedDevConfig;
  });
};

/**
 * Refresh dev configuration from remote URL
 */
export const refreshDevConfigFromRemoteUrl = (): Effect.Effect<void, ConfigError> => {
  return Effect.gen(function* () {
    logger.info("🔄 Refreshing dev configuration...");

    const currentConfig = yield* getDevConfig();
    const { configUrl } = currentConfig;

    const response = yield* Effect.tryPromise({
      try: () => fetch(configUrl),
      catch: (error: any) => configError(`Failed to fetch remote config from ${configUrl}: ${error.message}`),
    });

    if (!response.ok) {
      return yield* Effect.fail(
        configError(`Failed to fetch remote config from ${configUrl}: ${response.status} ${response.statusText}`),
      );
    }

    const configText = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error: any) => configError(`Failed to read response body: ${error.message}`),
    });

    const remoteConfig = yield* Effect.tryPromise({
      try: () => Promise.resolve(JSON.parse(configText)),
      catch: (error: any) => configError(`Remote config contains invalid JSON: ${error.message}`),
    });

    const result = devConfigSchema.safeParse(remoteConfig);
    if (!result.success) {
      return yield* Effect.fail(
        configError(
          `Remote config validation failed: ${result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", ")}`,
        ),
      );
    }

    yield* Effect.tryPromise({
      try: () => Bun.write(devConfigPath, JSON.stringify(result.data, null, 2)),
      catch: (error: any) => configError(`Failed to write updated config: ${error.message}`),
    });

    cachedDevConfig = null; // Clear cache
    logger.info("✅ Dev configuration refreshed successfully");
  });
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
export const createConfig = (): Effect.Effect<ConfigManager, ConfigError> => {
  return Effect.gen(function* () {
    const config = yield* getDevConfig();

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
  });
};

// Export the config for backward compatibility
export const devConfig = getDevConfig();
