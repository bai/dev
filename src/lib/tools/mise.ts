import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "bun";

import { stringify } from "@iarna/toml";

import { homeDir } from "~/lib/constants";
import { devConfig, type MiseConfig } from "~/lib/dev-config";

export const globalMiseConfigDir = path.join(homeDir, ".config", "mise");
export const globalMiseConfigPath = path.join(globalMiseConfigDir, "config.toml");

export const miseMinVersion = "2025.5.2";

export const miseGlobalConfig = {
  env: {
    _: {
      path: ["{{config_root}}/node_modules/.bin"],
    },
  },
  tools: {
    "bun": "latest",
    "go": "latest",
    "node": "latest",
    "python": "latest",
    "uv": "latest",
    "ruby": "latest",
    "rust": "latest",
    "gcloud": "latest",
    "aws-cli": "latest",
    "sops": "latest",
    "age": "latest",
    "terraform": "latest",
    "terragrunt": "latest",
    "golangci-lint": "latest",
    "jq": "latest",
    "fzf": "latest",
    "npm:@anthropic-ai/claude-code": "latest",
    "npm:eslint": "latest",
    "npm:npm-check-updates": "latest",
    "npm:pnpm": "latest",
    "npm:prettier": "latest",
    "npm:typescript": "latest",
  },
  settings: {
    idiomatic_version_file_enable_tools: ["python", "ruby"],
    trusted_config_paths: ["~/.dev"],
  },
} satisfies MiseConfig;

export const miseRepoConfig = {
  min_version: "2025.5.2",
  tools: {
    python: "3.11",
    sops: "latest",
    age: "latest",
  },
  env: {
    DEV_PROJECT_ROOT: "{{ config_root }}",
    _: {
      file: [
        ".env",
        ".env.development",
        ".env.secret.json",
        ".env.development.local",
      ],
    },
  },
} satisfies MiseConfig;

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
export const ensureMiseVersionOrUpgrade = async (): Promise<void> => {
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
    // Note: handleUpgradeCommand would need to be imported or implemented
    // For now, we'll exit and let the user manually upgrade
    // console.error(`💡 Please run 'dev upgrade' to update mise and other dependencies`);
    // process.exit(1);

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
  } catch (error: any) {
    console.error(`❌ Failed to upgrade dev CLI: ${error.message}`);
    process.exit(1);
  }
};

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
    if (!fs.existsSync(globalMiseConfigDir)) {
      console.log("   📂 Creating mise config directory...");
      fs.mkdirSync(globalMiseConfigDir, { recursive: true });
    }

    // Check if config already exists
    if (fs.existsSync(globalMiseConfigPath)) {
      console.log("   ✅ Mise config already exists");
      return;
    }

    // Amend the TOML config with trusted_config_paths from dev JSON config
    if (devConfig.mise?.settings?.trusted_config_paths && miseGlobalConfig.settings) {
      miseGlobalConfig.settings.trusted_config_paths = devConfig.mise.settings.trusted_config_paths;
    }

    // Serialize the final config as TOML and write to file
    const tomlText = stringify(miseGlobalConfig);
    await Bun.write(globalMiseConfigPath, tomlText + "\n");
    console.log("   ✅ Mise config installed");
  } catch (err) {
    console.error("❌ Error setting up mise configuration:", err);
    throw err;
  }
}
