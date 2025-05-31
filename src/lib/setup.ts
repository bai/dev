import fs from "fs";
import path from "path";
import { spawnSync } from "bun";

import { stringify } from "@iarna/toml";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { devDir, homeDir, miseConfigDir, miseConfigPath } from "~/lib/constants";
import { devConfig, miseConfigSchema } from "~/lib/dev-config";
import { handleCommandError } from "~/lib/handlers";
import { db } from "~/drizzle";

const gcloudConfigDir = path.join(homeDir, ".config", "gcloud");
const gcloudComponentsPath = path.join(gcloudConfigDir, ".default-cloud-sdk-components");

export async function ensureDatabaseIsUpToDate() {
  // console.log("🔄 Checking for database migrations...");
  migrate(db, { migrationsFolder: `${devDir}/src/drizzle/migrations` });
  // console.log("✅ Database migrations applied");
}

/**
 * Sets up the global mise configuration.
 *
 * This function creates the mise config directory if it doesn't exist,
 * loads the baseline global mise TOML config from the dev directory,
 * amends it with trusted_config_paths from the dev JSON config,
 * and writes the final configuration to the mise config file.
 *
 * @returns Promise<void> Resolves when the configuration is set up successfully
 * @throws Error if the mise config cannot be parsed or written
 */
export async function setupMiseGlobalConfig() {
  try {
    console.log("🎯 Setting up global mise configuration...");

    // Ensure mise config directory exists
    if (!fs.existsSync(miseConfigDir)) {
      console.log("   📂 Creating mise config directory...");
      fs.mkdirSync(miseConfigDir, { recursive: true });
    }

    // Check if config already exists
    if (fs.existsSync(miseConfigPath)) {
      console.log("   ✅ Mise config already exists");
      return;
    }

    // Load baseline global mise TOML config
    const miseGlobalConfig = await Bun.file(path.join(devDir, "hack", "configs", "mise-config-global.toml")).text();
    const parsedMiseGlobalConfig = miseConfigSchema.safeParse(Bun.TOML.parse(miseGlobalConfig));

    if (!parsedMiseGlobalConfig.success) {
      throw new Error("Failed to parse mise config");
    }

    // Amend the TOML config with trusted_config_paths from dev JSON config
    if (devConfig.mise && devConfig.mise.settings.trusted_config_paths) {
      parsedMiseGlobalConfig.data.settings.trusted_config_paths = devConfig.mise.settings.trusted_config_paths;
    }

    // Serialize the final config as TOML and write to file
    const tomlText = stringify(parsedMiseGlobalConfig.data);
    await Bun.write(miseConfigPath, tomlText + "\n");
    console.log("   ✅ Mise config installed");
  } catch (err) {
    console.error("❌ Error setting up mise configuration:", err);
    throw err;
  }
}

/**
 * Sets up the Google Cloud configuration.
 *
 * This function creates the gcloud config directory if it doesn't exist,
 * copies the default cloud SDK components configuration from the dev directory
 * to the appropriate gcloud config location.
 *
 * @returns Promise<void> Resolves when the configuration is set up successfully
 * @throws Error if the source config file is not found or cannot be copied
 */
export async function setupGoogleCloudConfig() {
  try {
    console.log("☁️  Setting up Google Cloud configuration...");

    // Ensure gcloud config directory exists
    if (!fs.existsSync(gcloudConfigDir)) {
      console.log("   📂 Creating gcloud config directory...");
      fs.mkdirSync(gcloudConfigDir, { recursive: true });
    }

    // Copy cloud SDK components config
    const sourceConfigPath = path.join(devDir, "hack", "configs", "default-cloud-sdk-components");

    if (!fs.existsSync(sourceConfigPath)) {
      throw new Error(`Source config file not found: ${sourceConfigPath}`);
    }

    const configContent = await Bun.file(sourceConfigPath).text();
    await Bun.write(gcloudComponentsPath, configContent);
    console.log("   ✅ Google Cloud config ready");
  } catch (err) {
    console.error("❌ Error setting up Google Cloud configuration:", err);
    throw err;
  }
}

/**
 * Sets up the Bun runtime using mise.
 *
 * This function checks if Bun is already available on the system.
 * If not, it installs Bun using mise with the latest version.
 *
 * @returns Promise<void> Resolves when Bun is available or installed successfully
 * @throws Error if mise is not available or the installation fails
 */
export async function setupBunRuntime() {
  try {
    console.log("🏃 Setting up bun runtime...");

    // Check if bun is already available
    const bunCheck = spawnSync(["which", "bun"], { stdio: ["ignore", "pipe", "pipe"] });
    if (bunCheck.exitCode === 0) {
      console.log("   ✅ Bun already available");
      return;
    }

    console.log("   📥 Installing bun via mise...");
    const proc = spawnSync(["mise", "install", "bun@latest"], { stdio: ["ignore", "inherit", "inherit"] });

    if (proc.exitCode !== 0) {
      throw new Error(`mise install bun@latest failed with exit code ${proc.exitCode}`);
    }

    console.log("   ✅ Bun installed");
  } catch (error: any) {
    if (error.code === "ENOENT") {
      handleCommandError(error, "bun installation", "mise");
    } else {
      console.error("❌ Error setting up bun runtime:", error);
      throw error;
    }
  }
}
