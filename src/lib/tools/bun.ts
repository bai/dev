import { spawn, spawnSync } from "bun";

import { ExternalToolError } from "~/lib/errors";
import { isDebugMode } from "~/lib/is-debug-mode";
import { logger } from "~/lib/logger";

export const bunMinVersion = "1.2.16";

/**
 * Gets the current bun version.
 *
 * @returns The current bun version string, or null if unable to retrieve
 */
export const getCurrentBunVersion = (): string | null => {
  try {
    const result = spawnSync(["bun", "--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.exitCode === 0 && result.stdout) {
      const output = result.stdout.toString().trim();

      if (isDebugMode()) {
        logger.debug("bun --version raw output:", output);
      }

      // Bun version output is typically just the version number like "1.2.16"
      const version = output.trim();
      // Validate it looks like a version
      if (/^\d+\.\d+\.\d+/.test(version)) {
        if (isDebugMode()) {
          logger.debug(`Extracted bun version: ${version}`);
        }
        return version;
      }

      if (isDebugMode()) {
        logger.debug("Failed to extract version from bun output");
      }
      return null;
    }

    if (isDebugMode()) {
      logger.debug(`bun --version failed with exit code: ${result.exitCode}`);
      if (result.stderr) {
        logger.debug(`stderr: ${result.stderr.toString()}`);
      }
    }
    return null;
  } catch (error: any) {
    if (isDebugMode()) {
      logger.debug(`Error getting bun version: ${error.message}`);
    }
    return null;
  }
};

/**
 * Compares two version strings using semantic versioning.
 *
 * @param version1 - First version string (e.g., "1.2.16")
 * @param version2 - Second version string (e.g., "1.2.15")
 * @returns -1 if version1 < version2, 0 if equal, 1 if version1 > version2
 */
export const compareVersions = (version1: string, version2: string): number => {
  const v1Parts = version1.split(".").map(Number);
  const v2Parts = version2.split(".").map(Number);

  // Ensure both arrays have the same length by padding with zeros
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
 * Formats version comparison for display.
 */
const formatVersionComparison = (current: string, required: string): string => {
  const comparison = compareVersions(current, required);
  if (comparison < 0) {
    return `${current} → ${required} (upgrade needed)`;
  } else if (comparison === 0) {
    return `${current} (up to date)`;
  } else {
    return `${current} (newer than required ${required})`;
  }
};

/**
 * Checks if the current bun version meets the minimum required version.
 *
 * @returns Object with isValid boolean and currentVersion string
 */
export const checkBunVersion = (): { isValid: boolean; currentVersion: string | null } => {
  const currentVersion = getCurrentBunVersion();

  if (!currentVersion) {
    return { isValid: false, currentVersion: null };
  }

  const comparison = compareVersions(currentVersion, bunMinVersion);

  if (isDebugMode()) {
    logger.debug(`Version check: ${formatVersionComparison(currentVersion, bunMinVersion)}`);
  }

  return {
    isValid: comparison >= 0,
    currentVersion,
  };
};

/**
 * Runs bun upgrade command with progress output and retry logic.
 *
 * @param retries - Number of retries to attempt (default: 3)
 * @returns Promise<boolean> - True if update was successful, false otherwise
 */
export const runBunUpgrade = async (retries = 3): Promise<boolean> => {
  let attempt = 1;

  while (attempt <= retries) {
    try {
      if (attempt > 1) {
        logger.info(`🔄 Retry attempt ${attempt}/${retries}...`);
      }

      logger.info("⏳ Updating bun... (this may take a moment)");

      // Use streaming output for better user experience
      const process = spawn(["bun", "upgrade"], {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";

      // Stream stdout
      if (process.stdout) {
        const reader = process.stdout.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            output += chunk;

            // Show progress to user
            const lines = chunk.trim().split("\n");
            for (const line of lines) {
              if (line.trim()) {
                // Filter out verbose download progress but show meaningful updates
                if (
                  line.includes("Downloading") ||
                  line.includes("Installing") ||
                  line.includes("Updated") ||
                  line.includes("bun was upgraded")
                ) {
                  logger.info(`   ${line.trim()}`);
                } else if (isDebugMode()) {
                  logger.debug(`   ${line.trim()}`);
                }
              }
            }
          }
        } catch (readError: any) {
          if (isDebugMode()) {
            logger.debug(`Error reading stdout: ${readError.message}`);
          }
        }
      }

      // Capture stderr
      if (process.stderr) {
        const reader = process.stderr.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            errorOutput += decoder.decode(value, { stream: true });
          }
        } catch (readError: any) {
          if (isDebugMode()) {
            logger.debug(`Error reading stderr: ${readError.message}`);
          }
        }
      }

      const exitCode = await process.exited;

      if (exitCode === 0) {
        // Get new version after update
        const newVersion = getCurrentBunVersion();
        if (newVersion) {
          logger.success(`✅ Bun updated successfully to version ${newVersion}`);
        } else {
          logger.success(`✅ Bun update completed successfully`);
        }
        return true;
      } else {
        if (isDebugMode()) {
          logger.debug(`bun upgrade exit code: ${exitCode}`);
          if (errorOutput) {
            logger.debug(`stderr: ${errorOutput}`);
          }
        }

        // Check if it's a network error
        if (errorOutput.includes("network") || errorOutput.includes("timeout") || errorOutput.includes("connection")) {
          logger.warn(`⚠️  Network error during update (attempt ${attempt}/${retries})`);
          if (attempt < retries) {
            await Bun.sleep(2000 * attempt); // Exponential backoff
            attempt++;
            continue;
          }
        }

        logger.error(`❌ Bun upgrade failed with exit code: ${exitCode}`);
        if (errorOutput && !isDebugMode()) {
          logger.error(`   Error: ${errorOutput.trim()}`);
        }
        return false;
      }
    } catch (error: any) {
      logger.error(`❌ Error running bun upgrade: ${error.message}`);
      if (isDebugMode()) {
        logger.debug(`Full error:`, error);
      }

      // Retry on certain errors
      if (error.message.includes("network") || error.code === "ENOTFOUND") {
        if (attempt < retries) {
          await Bun.sleep(2000 * attempt);
          attempt++;
          continue;
        }
      }
      return false;
    }
  }

  return false;
};

/**
 * Checks bun version and triggers upgrade if needed.
 * This should be called before running bun-related commands.
 *
 * @returns Promise<void> - Resolves if version is valid or upgrade succeeds
 */
export const ensureBunVersionOrUpgrade = async (): Promise<void> => {
  const { isValid, currentVersion } = checkBunVersion();

  if (isValid) {
    if (isDebugMode() && currentVersion) {
      logger.debug(`Bun version ${currentVersion} meets minimum requirement ${bunMinVersion}`);
    }
    return; // Version is fine, continue
  }

  if (currentVersion) {
    logger.warn(`⚠️  Bun version ${currentVersion} is older than required ${bunMinVersion}`);
    logger.info(`   ${formatVersionComparison(currentVersion, bunMinVersion)}`);
  } else {
    logger.warn(`⚠️  Unable to determine bun version`);
    logger.info(`   Expected version ${bunMinVersion} or newer`);
  }

  logger.info(`🚀 Starting bun upgrade...`);

  try {
    // Run bun upgrade with retry logic
    const updateSuccess = await runBunUpgrade();

    if (!updateSuccess) {
      throw new ExternalToolError(
        `Failed to update bun to required version.\n💡 Try manually upgrading bun:\n   • Run: bun upgrade\n   • Or reinstall: curl -fsSL https://bun.sh/install | bash\n   • Visit: https://bun.sh/docs/installation`,
        { extra: { tool: "bun", operation: "upgrade" } },
      );
    }

    // After upgrade, check again
    const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = checkBunVersion();

    if (!isValidAfterUpgrade) {
      throw new ExternalToolError(
        `Bun upgrade completed but version still doesn't meet requirement.\n` +
          `Current: ${versionAfterUpgrade || "unknown"}, Required: ${bunMinVersion}\n` +
          `💡 This might be due to:\n` +
          `   • PATH issues - try 'which bun' to check location\n` +
          `   • Multiple bun installations\n` +
          `   • Installation conflicts`,
        {
          extra: {
            tool: "bun",
            operation: "version-check",
            currentVersion: versionAfterUpgrade,
            requiredVersion: bunMinVersion,
          },
        },
      );
    }

    if (currentVersion && versionAfterUpgrade) {
      logger.success(`✨ Bun successfully upgraded: ${currentVersion} → ${versionAfterUpgrade}`);
    } else if (versionAfterUpgrade) {
      logger.success(`✨ Bun upgraded to version ${versionAfterUpgrade}`);
    }
  } catch (error: any) {
    if (error instanceof ExternalToolError) {
      throw error; // Re-throw CLI errors as-is
    }
    throw new ExternalToolError(`Unexpected error during bun upgrade: ${error.message}`, {
      extra: { tool: "bun", operation: "upgrade", originalError: error.message },
    });
  }
};
