import fs from "fs";
import path from "path";

import { stringify } from "@iarna/toml";
import { spawnSync } from "bun";

import { devDir, homeDir, miseConfigDir, miseConfigPath, stdioInherit, stdioPipe } from "~/lib/constants";
import { devConfig } from "~/lib/dev-config";
import { handleCommandError } from "~/lib/handlers";
import { miseConfigSchema } from "~/lib/types";

const gcloudConfigDir = path.join(homeDir, ".config", "gcloud");
const gcloudComponentsPath = path.join(gcloudConfigDir, ".default-cloud-sdk-components");

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
    if (devConfig.mise && devConfig.mise.trusted_config_paths) {
      parsedMiseGlobalConfig.data.settings.trusted_config_paths = devConfig.mise.trusted_config_paths;
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

export async function setupBunRuntime() {
  try {
    console.log("🏃 Setting up bun runtime...");

    // Check if bun is already available
    const bunCheck = spawnSync(["which", "bun"], { stdio: stdioPipe });
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
