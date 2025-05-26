import fs from "fs";

import { devConfigDir, devConfigPath } from "~/lib/constants";
import { devConfigSchema } from "~/lib/types";

/**
 * Ensures the development configuration directory and file exist.
 *
 * Creates the config directory if it doesn't exist, and creates a minimal
 * valid config file if it doesn't exist.
 */
async function ensureConfigExists() {
  // Create config directory if it doesn't exist
  if (!fs.existsSync(devConfigDir)) {
    fs.mkdirSync(devConfigDir, { recursive: true });
  }

  // Create config file if it doesn't exist
  if (!fs.existsSync(devConfigPath)) {
    const defaultConfig = {};
    await Bun.write(devConfigPath, JSON.stringify(defaultConfig, null, 2));
  }
}

export async function refreshDevConfigFromRemoteUrl() {
  await ensureConfigExists();

  const response = await fetch(devConfig.configUrl);
  const configData = await response.text();

  await Bun.write(devConfigPath, configData);
}

/**
 * Loads and validates the development configuration from the config file.
 *
 * Reads the JSON configuration file from the dev directory and validates it
 * against the expected schema. Creates the directory and file if they don't exist.
 * Throws an error if the configuration is invalid.
 *
 * @returns Promise<DevConfig> The parsed and validated development configuration
 * @throws Error if the configuration file cannot be parsed or is invalid
 */
export async function getDevConfig() {
  await ensureConfigExists();

  const devConfig = await Bun.file(devConfigPath).json();
  const jsonConfig = devConfigSchema.safeParse(devConfig);

  if (!jsonConfig.success) {
    throw new Error("Failed to parse dev config");
  }

  return jsonConfig.data;
}

/**
 * The global development configuration instance.
 *
 * This is a pre-loaded and validated configuration object that can be imported
 * and used throughout the application without needing to reload the config file.
 */
export const devConfig = await getDevConfig();
