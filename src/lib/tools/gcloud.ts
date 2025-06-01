import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { homeDir } from "~/lib/constants";

import { createLogger } from "../logger";

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
export async function setupGoogleCloudConfig(): Promise<void> {
  const logger = createLogger();

  try {
    logger.info("☁️  Setting up Google Cloud configuration...");

    // Ensure gcloud config directory exists
    if (!fs.existsSync(gcloudConfigDir)) {
      logger.info("   📂 Creating gcloud config directory...");
      await fs.promises.mkdir(gcloudConfigDir, { recursive: true });
    }

    await Bun.write(gcloudComponentsPath, gcloudComponents.join("\n"));
    logger.info("   ✅ Google Cloud config ready");
  } catch (err: any) {
    logger.error("❌ Error setting up Google Cloud configuration:", err);
    throw err;
  }
}
