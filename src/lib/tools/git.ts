import { spawn, spawnSync } from "bun";

import { isDebugMode } from "~/lib/is-debug-mode";
import { logger } from "~/lib/logger";

export const gitMinVersion = "2.50.0";

/**
 * Gets the current git version.
 *
 * @returns The current git version string, or null if unable to retrieve
 */
export const getCurrentGitVersion = (): string | null => {
  try {
    const result = spawnSync(["git", "--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.exitCode === 0 && result.stdout) {
      const output = result.stdout.toString().trim();

      if (isDebugMode()) {
        logger.debug("git --version raw output:", output);
      }

      // Git version output is like "git version 2.39.2"
      const match = output.match(/git version (\d+\.\d+\.\d+)/);
      if (match && match[1]) {
        const version = match[1];
        if (isDebugMode()) {
          logger.debug(`Extracted git version: ${version}`);
        }
        return version;
      }

      if (isDebugMode()) {
        logger.debug("Failed to extract version from git output");
      }
      return null;
    }

    if (isDebugMode()) {
      logger.debug(`git --version failed with exit code: ${result.exitCode}`);
      if (result.stderr) {
        logger.debug(`stderr: ${result.stderr.toString()}`);
      }
    }
    return null;
  } catch (error: any) {
    if (isDebugMode()) {
      logger.debug(`Error getting git version: ${error.message}`);
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
 * Checks if the current git version meets the minimum required version.
 */
export const checkGitVersion = (): { isValid: boolean; currentVersion: string | null } => {
  const currentVersion = getCurrentGitVersion();

  if (!currentVersion) {
    return { isValid: false, currentVersion: null };
  }

  const comparison = compareVersions(currentVersion, gitMinVersion);

  if (isDebugMode()) {
    logger.debug(`Git version check: ${currentVersion} vs ${gitMinVersion} (${comparison >= 0 ? "valid" : "invalid"})`);
  }

  return {
    isValid: comparison >= 0,
    currentVersion,
  };
};

/**
 * Performs git upgrade using mise.
 */
export const performGitUpgrade = async (): Promise<boolean> => {
  try {
    logger.info("⏳ Updating git via mise...");

    const process = spawn(["mise", "install", "git@latest"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const exitCode = await process.exited;

    if (exitCode === 0) {
      logger.success("✅ Git updated successfully via mise");
      return true;
    } else {
      logger.error(`❌ Git update failed with exit code: ${exitCode}`);
      return false;
    }
  } catch (error: any) {
    logger.error(`❌ Error updating git: ${error.message}`);
    return false;
  }
};

/**
 * Ensures git version meets requirements or upgrades if needed.
 */
export const ensureGitVersionOrUpgrade = async (): Promise<void> => {
  const { isValid, currentVersion } = checkGitVersion();

  if (isValid) {
    if (isDebugMode() && currentVersion) {
      logger.debug(`Git version ${currentVersion} meets minimum requirement ${gitMinVersion}`);
    }
    return;
  }

  if (currentVersion) {
    logger.warn(`⚠️  Git version ${currentVersion} is older than required ${gitMinVersion}`);
  } else {
    logger.warn(`⚠️  Unable to determine git version`);
  }

  logger.info(`🚀 Starting git upgrade via mise...`);

  const updateSuccess = await performGitUpgrade();
  if (!updateSuccess) {
    logger.error(`❌ Failed to update git to required version`);
    logger.error(`💡 Try manually installing git via mise: mise install git@latest`);
    process.exit(1);
  }

  // Verify upgrade
  const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = checkGitVersion();
  if (!isValidAfterUpgrade) {
    logger.error(`❌ Git upgrade completed but version still doesn't meet requirement`);
    if (versionAfterUpgrade) {
      logger.error(`   Current: ${versionAfterUpgrade}, Required: ${gitMinVersion}`);
    }
    process.exit(1);
  }

  if (versionAfterUpgrade) {
    logger.success(`✨ Git successfully upgraded to version ${versionAfterUpgrade}`);
  }
};
