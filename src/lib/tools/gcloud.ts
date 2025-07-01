import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "bun";

import { homeDir } from "~/lib/constants";
import { ExternalToolError } from "~/lib/errors";
import { isDebugMode } from "~/lib/is-debug-mode";
import { logger } from "~/lib/logger";

export const gcloudMinVersion = "527.0.0";

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
 * Gets the current gcloud version.
 *
 * @returns The current gcloud version string, or null if unable to retrieve
 */
export const getCurrentGcloudVersion = (): string | null => {
  try {
    // First try the standard gcloud version command
    const result = spawnSync(["gcloud", "version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.exitCode === 0 && result.stdout) {
      const output = result.stdout.toString().trim();

      if (isDebugMode()) {
        logger.debug("gcloud version raw output:", output);
      }

      // gcloud version output typically contains lines like:
      // "Google Cloud SDK 527.0.0"
      // "bq 2.1.7"
      // "core 2024.11.22"

      // Look for the main SDK version line
      const lines = output.split("\n");
      for (const line of lines) {
        const trimmedLine = line.trim();

        // Match "Google Cloud SDK X.Y.Z" format
        const sdkMatch = trimmedLine.match(/Google Cloud SDK (\d+\.\d+\.\d+)/i);
        if (sdkMatch && sdkMatch[1]) {
          const version = sdkMatch[1];
          if (isDebugMode()) {
            logger.debug(`Extracted gcloud version: ${version}`);
          }
          return version;
        }
      }

      // Fallback: look for any version pattern in the output
      const fallbackMatch = output.match(/(\d+\.\d+\.\d+)/);
      if (fallbackMatch && fallbackMatch[1]) {
        const version = fallbackMatch[1];
        if (isDebugMode()) {
          logger.debug(`Extracted gcloud version (fallback): ${version}`);
        }
        return version;
      }

      if (isDebugMode()) {
        logger.debug("Failed to extract version from gcloud output");
        logger.debug("Full output for debugging:", output);
      }
      return null;
    }

    if (isDebugMode()) {
      logger.debug(`gcloud version failed with exit code: ${result.exitCode}`);
      if (result.stderr) {
        logger.debug(`stderr: ${result.stderr.toString()}`);
      }
    }
    return null;
  } catch (error: any) {
    if (isDebugMode()) {
      logger.debug(`Error getting gcloud version: ${error.message}`);
    }
    return null;
  }
};

/**
 * Compares two version strings using semantic versioning.
 */
export const compareVersions = (version1: string, version2: string): number => {
  const v1Parts = version1.split(".").map(Number);
  const v2Parts = version2.split(".").map(Number);

  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  while (v1Parts.length < maxLength) v1Parts.push(0);
  while (v2Parts.length < maxLength) v2Parts.push(0);

  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] ?? 0;
    const v2Part = v2Parts[i] ?? 0;

    if (v1Part < v2Part) return -1;
    if (v1Part > v2Part) return 1;
  }

  return 0;
};

/**
 * Checks if the current gcloud version meets the minimum required version.
 */
export const checkGcloudVersion = (): { isValid: boolean; currentVersion: string | null } => {
  const currentVersion = getCurrentGcloudVersion();

  if (!currentVersion) {
    return { isValid: false, currentVersion: null };
  }

  const comparison = compareVersions(currentVersion, gcloudMinVersion);

  if (isDebugMode()) {
    logger.debug(
      `Gcloud version check: ${currentVersion} vs ${gcloudMinVersion} (${comparison >= 0 ? "valid" : "invalid"})`,
    );
  }

  return {
    isValid: comparison >= 0,
    currentVersion,
  };
};

/**
 * Performs gcloud upgrade using mise.
 */
export const performGcloudUpgrade = async (): Promise<boolean> => {
  try {
    logger.info("⏳ Updating gcloud via mise...");

    const process = spawn(["mise", "install", "gcloud@latest"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const exitCode = await process.exited;

    if (exitCode === 0) {
      logger.success("✅ Gcloud updated successfully via mise");
      return true;
    } else {
      logger.error(`❌ Gcloud update failed with exit code: ${exitCode}`);
      return false;
    }
  } catch (error: any) {
    logger.error(`❌ Error updating gcloud: ${error.message}`);
    return false;
  }
};

/**
 * Ensures gcloud version meets requirements or upgrades if needed.
 */
export const ensureGcloudVersionOrUpgrade = async (): Promise<void> => {
  const { isValid, currentVersion } = checkGcloudVersion();

  if (isValid) {
    if (isDebugMode() && currentVersion) {
      logger.debug(`Gcloud version ${currentVersion} meets minimum requirement ${gcloudMinVersion}`);
    }
    return;
  }

  if (currentVersion) {
    logger.warn(`⚠️  Gcloud version ${currentVersion} is older than required ${gcloudMinVersion}`);
  } else {
    logger.warn(`⚠️  Unable to determine gcloud version`);
  }

  logger.info(`🚀 Starting gcloud upgrade via mise...`);

  const updateSuccess = await performGcloudUpgrade();
  if (!updateSuccess) {
    logger.error(`❌ Failed to update gcloud to required version`);
    logger.error(`💡 Try manually installing gcloud via mise: mise install gcloud@latest`);
    throw new ExternalToolError("Failed to update gcloud", {
      extra: { tool: "gcloud", requiredVersion: gcloudMinVersion, currentVersion },
    });
  }

  // Verify upgrade
  const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = checkGcloudVersion();
  if (!isValidAfterUpgrade) {
    logger.error(`❌ Gcloud upgrade completed but version still doesn't meet requirement`);
    if (versionAfterUpgrade) {
      logger.error(`   Current: ${versionAfterUpgrade}, Required: ${gcloudMinVersion}`);
    }
    throw new ExternalToolError("Gcloud upgrade failed", {
      extra: {
        tool: "gcloud",
        requiredVersion: gcloudMinVersion,
        currentVersion: versionAfterUpgrade,
      },
    });
  }

  if (versionAfterUpgrade) {
    logger.success(`✨ Gcloud successfully upgraded to version ${versionAfterUpgrade}`);
  }
};

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
