import fs from "fs";
import path from "path";

import { homeDir } from "~/lib/constants";

const gcloudConfigDir = path.join(homeDir, ".config", "gcloud");
const gcloudComponentsPath = path.join(gcloudConfigDir, ".default-cloud-sdk-components");

const gcloudComponents = [
  "alpha",
  "beta",
  "cloud_sql_proxy",
  "cloud-build-local",
  "config-connector",
  "docker-credential-gcr",
  "gke-gcloud-auth-plugin",
  "kpt",
  "kubectl",
  "kustomize",
  "terraform-tools",
];

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

    await Bun.write(gcloudComponentsPath, gcloudComponents.join("\n"));
    console.log("   ✅ Google Cloud config ready");
  } catch (err) {
    console.error("❌ Error setting up Google Cloud configuration:", err);
    throw err;
  }
}
