import fs from "fs";
import path from "path";

import { devDir, homeDir } from "~/lib/constants";

const gcloudConfigDir = path.join(homeDir, ".config", "gcloud");
const gcloudComponentsPath = path.join(gcloudConfigDir, ".default-cloud-sdk-components");

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
