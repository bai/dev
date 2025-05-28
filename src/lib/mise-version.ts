import { spawnSync } from "bun";

import { miseMinVersion } from "~/lib/constants";

/**
 * Gets the current mise version.
 *
 * @returns The current mise version string, or null if unable to retrieve
 */
export const getCurrentMiseVersion = (): string | null => {
  try {
    const result = spawnSync(["mise", "--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.exitCode === 0 && result.stdout) {
      const output = result.stdout.toString().trim();
      // Extract version from output - the version is typically on the last line like "2025.5.14 macos-arm64 (2025-05-26)"
      const lines = output.split("\n");
      for (const line of lines) {
        const trimmedLine = line.trim();
        // Look for a line that starts with a version pattern
        const match = trimmedLine.match(/^(\d+\.\d+\.\d+)/);
        if (match) {
          return match[1] ?? null;
        }
      }
      return null;
    }
    return null;
  } catch (error) {
    return null;
  }
};

/**
 * Compares two version strings using semantic versioning.
 *
 * @param version1 - First version string (e.g., "2025.5.2")
 * @param version2 - Second version string (e.g., "2025.5.1")
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
 * Checks if the current mise version meets the minimum required version.
 *
 * @returns Object with isValid boolean and currentVersion string
 */
export const checkMiseVersion = (): { isValid: boolean; currentVersion: string | null } => {
  const currentVersion = getCurrentMiseVersion();

  if (!currentVersion) {
    return { isValid: false, currentVersion: null };
  }

  const comparison = compareVersions(currentVersion, miseMinVersion);
  return {
    isValid: comparison >= 0,
    currentVersion,
  };
};

/**
 * Checks mise version and triggers upgrade if needed.
 * This should be called before running mise-related commands.
 *
 * @param commandName - Name of the command being executed (for error context)
 * @returns Promise<void> - Resolves if version is valid or upgrade succeeds
 */
export const ensureMiseVersionOrUpgrade = async (commandName: string): Promise<void> => {
  const { isValid, currentVersion } = checkMiseVersion();

  if (isValid) {
    return; // Version is fine, continue
  }

  if (currentVersion) {
    console.log(`⚠️  Mise version ${currentVersion} is older than required ${miseMinVersion}`);
  } else {
    console.log(`⚠️  Unable to determine mise version, expected ${miseMinVersion} or newer`);
  }

  console.log(`🔄 Running dev upgrade to update mise and other dependencies...`);

  try {
    const { handleUpgradeCommand } = await import("~/cmd/upgrade");
    handleUpgradeCommand();

    // After upgrade, check again
    const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = checkMiseVersion();

    if (!isValidAfterUpgrade) {
      console.error(`❌ Failed to upgrade mise to required version ${miseMinVersion}`);
      if (versionAfterUpgrade) {
        console.error(`   Current version: ${versionAfterUpgrade}`);
      }
      console.error(`💡 You may need to manually upgrade mise or check your installation`);
      process.exit(1);
    }

    console.log(`✅ Mise upgraded successfully to ${versionAfterUpgrade}`);
    console.log(`🚀 Continuing with ${commandName}...`);
  } catch (error: any) {
    console.error(`❌ Failed to upgrade dev CLI: ${error.message}`);
    process.exit(1);
  }
};
