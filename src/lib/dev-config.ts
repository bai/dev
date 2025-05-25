import { devConfigPath } from "~/lib/constants";
import { devConfigSchema } from "~/lib/types";

/**
 * Loads and validates the development configuration from the config file.
 *
 * Reads the JSON configuration file from the dev directory and validates it
 * against the expected schema. Throws an error if the configuration is invalid.
 *
 * @returns Promise<DevConfig> The parsed and validated development configuration
 * @throws Error if the configuration file cannot be parsed or is invalid
 */
export async function getDevConfig() {
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
