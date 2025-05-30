import fs from "node:fs";

import { z } from "zod/v4";

import { devConfigDir, devConfigPath } from "~/lib/constants";

const gitProviderSchema = z.enum(["github", "gitlab"]);

/**
 * Mise config schema
 * @see https://mise.jdx.dev/configuration/settings.html
 */
export const miseConfigSchema = z.object({
  env: z.object({ _: z.object({ path: z.array(z.string()) }) }),
  tools: z.record(z.string(), z.string()),
  settings: z.object({
    idiomatic_version_file_enable_tools: z.array(z.string()),
    trusted_config_paths: z.array(z.string()),
  }),
});

export const devConfigSchema = z.object({
  configUrl: z
    .url()
    .default("https://raw.githubusercontent.com/bai/dev/main/hack/configs/dev-config.json")
    .describe("URL to the dev config file, set to whatever URL was used to install dev"),

  defaultOrg: z.string().default("bai").describe("Default organization to use for cloning repositories"),

  orgToProvider: z
    .record(z.string(), gitProviderSchema)
    .default({ "gitlab-org": "gitlab" })
    .describe("Map of organizations to their preferred git provider"),

  mise: miseConfigSchema.optional().describe("Mise configuration settings"),
});

export type DevConfig = z.infer<typeof devConfigSchema>;
export type GitProviderType = z.infer<typeof gitProviderSchema>;

class ConfigError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ConfigError";
  }
}

class ConfigManager {
  private static instance: ConfigManager;
  private cachedConfig: DevConfig | null = null;

  private constructor() {
    // Private constructor enforces singleton pattern
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private ensureConfigExists(): void {
    try {
      if (!fs.existsSync(devConfigDir)) {
        fs.mkdirSync(devConfigDir, { recursive: true });
      }

      if (!fs.existsSync(devConfigPath)) {
        const defaultConfig = devConfigSchema.parse({});
        fs.writeFileSync(devConfigPath, JSON.stringify(defaultConfig, null, 2));
      }
    } catch (error) {
      throw new ConfigError("Failed to ensure config exists", error);
    }
  }

  getConfig(): DevConfig {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    this.ensureConfigExists();

    try {
      const jsonText = fs.readFileSync(devConfigPath, "utf-8");
      const parsedJson = JSON.parse(jsonText);
      this.cachedConfig = devConfigSchema.parse(parsedJson);
      return this.cachedConfig;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ConfigError(`Invalid JSON in config file: ${devConfigPath}`, error);
      }
      if (error instanceof z.ZodError) {
        throw new ConfigError(`Invalid config schema: ${error.message}`, error);
      }
      throw new ConfigError("Failed to load config", error);
    }
  }

  async refreshFromRemote(): Promise<void> {
    console.log("🔄 Refreshing dev configuration...");

    const currentConfig = this.getConfig();
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
      const validatedConfig = devConfigSchema.parse(remoteConfig);

      // Write the validated config
      await Bun.write(devConfigPath, JSON.stringify(validatedConfig, null, 2));

      // Invalidate cache
      this.cachedConfig = null;

      console.log("✅ Dev configuration refreshed successfully");
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new ConfigError("Remote config contains invalid JSON", error);
      }
      if (error instanceof z.ZodError) {
        throw new ConfigError(`Remote config validation failed: ${error.message}`, error);
      }
      throw new ConfigError("Failed to refresh config from remote", error);
    }
  }

  clearCache(): void {
    this.cachedConfig = null;
  }

  async updateConfig(updates: Partial<DevConfig>): Promise<void> {
    const currentConfig = this.getConfig();
    const newConfig = { ...currentConfig, ...updates };
    const validatedConfig = devConfigSchema.parse(newConfig);

    await Bun.write(devConfigPath, JSON.stringify(validatedConfig, null, 2));
    this.cachedConfig = validatedConfig;
  }
}

const configManager = ConfigManager.getInstance();

export function getDevConfig(): DevConfig {
  return configManager.getConfig();
}

export async function refreshDevConfigFromRemoteUrl(): Promise<void> {
  return configManager.refreshFromRemote();
}

export async function updateDevConfig(updates: Partial<DevConfig>): Promise<void> {
  return configManager.updateConfig(updates);
}

export function clearConfigCache(): void {
  return configManager.clearCache();
}

export const devConfig = getDevConfig();
