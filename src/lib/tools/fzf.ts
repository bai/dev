import { spawn, spawnSync } from "bun";

import { isDebugMode } from "~/lib/is-debug-mode";
import { logger } from "~/lib/logger";

export const fzfMinVersion = "0.62.0";

/**
 * Gets the current fzf version.
 *
 * @returns The current fzf version string, or null if unable to retrieve
 */
export const getCurrentFzfVersion = (): string | null => {
  try {
    const result = spawnSync(["fzf", "--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.exitCode === 0 && result.stdout) {
      const output = result.stdout.toString().trim();

      if (isDebugMode()) {
        logger.debug("fzf --version raw output:", output);
      }

      // fzf version output is like "0.44.1 (brew)"
      const match = output.match(/(\d+\.\d+\.\d+)/);
      if (match && match[1]) {
        const version = match[1];
        if (isDebugMode()) {
          logger.debug(`Extracted fzf version: ${version}`);
        }
        return version;
      }

      if (isDebugMode()) {
        logger.debug("Failed to extract version from fzf output");
      }
      return null;
    }

    if (isDebugMode()) {
      logger.debug(`fzf --version failed with exit code: ${result.exitCode}`);
      if (result.stderr) {
        logger.debug(`stderr: ${result.stderr.toString()}`);
      }
    }
    return null;
  } catch (error: any) {
    if (isDebugMode()) {
      logger.debug(`Error getting fzf version: ${error.message}`);
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
 * Checks if the current fzf version meets the minimum required version.
 */
export const checkFzfVersion = (): { isValid: boolean; currentVersion: string | null } => {
  const currentVersion = getCurrentFzfVersion();

  if (!currentVersion) {
    return { isValid: false, currentVersion: null };
  }

  const comparison = compareVersions(currentVersion, fzfMinVersion);

  if (isDebugMode()) {
    logger.debug(`Fzf version check: ${currentVersion} vs ${fzfMinVersion} (${comparison >= 0 ? "valid" : "invalid"})`);
  }

  return {
    isValid: comparison >= 0,
    currentVersion,
  };
};

/**
 * Performs fzf upgrade using mise.
 */
export const performFzfUpgrade = async (): Promise<boolean> => {
  try {
    logger.info("⏳ Updating fzf via mise...");

    const process = spawn(["mise", "install", "fzf@latest"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const exitCode = await process.exited;

    if (exitCode === 0) {
      logger.success("✅ Fzf updated successfully via mise");
      return true;
    } else {
      logger.error(`❌ Fzf update failed with exit code: ${exitCode}`);
      return false;
    }
  } catch (error: any) {
    logger.error(`❌ Error updating fzf: ${error.message}`);
    return false;
  }
};

/**
 * Ensures fzf version meets requirements or upgrades if needed.
 */
export const ensureFzfVersionOrUpgrade = async (): Promise<void> => {
  const { isValid, currentVersion } = checkFzfVersion();

  if (isValid) {
    if (isDebugMode() && currentVersion) {
      logger.debug(`Fzf version ${currentVersion} meets minimum requirement ${fzfMinVersion}`);
    }
    return;
  }

  if (currentVersion) {
    logger.warn(`⚠️  Fzf version ${currentVersion} is older than required ${fzfMinVersion}`);
  } else {
    logger.warn(`⚠️  Unable to determine fzf version`);
  }

  logger.info(`🚀 Starting fzf upgrade via mise...`);

  const updateSuccess = await performFzfUpgrade();
  if (!updateSuccess) {
    logger.error(`❌ Failed to update fzf to required version`);
    logger.error(`💡 Try manually installing fzf via mise: mise install fzf@latest`);
    process.exit(1);
  }

  // Verify upgrade
  const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = checkFzfVersion();
  if (!isValidAfterUpgrade) {
    logger.error(`❌ Fzf upgrade completed but version still doesn't meet requirement`);
    if (versionAfterUpgrade) {
      logger.error(`   Current: ${versionAfterUpgrade}, Required: ${fzfMinVersion}`);
    }
    process.exit(1);
  }

  if (versionAfterUpgrade) {
    logger.success(`✨ Fzf successfully upgraded to version ${versionAfterUpgrade}`);
  }
};
