import fs from "fs";
import path from "path";

import { stringify } from "@iarna/toml";
import z from "zod/v4";

import { homeDir } from "~/lib/constants";
import { devConfig } from "~/lib/dev-config";
import { ExternalToolError } from "~/lib/errors";
import { isDebugMode } from "~/lib/is-debug-mode";
import { logger } from "~/lib/logger";

export const globalMiseConfigDir = path.join(homeDir, ".config", "mise");
export const globalMiseConfigPath = path.join(globalMiseConfigDir, "config.toml");

export const miseMinVersion = "2025.6.5";

/**
 * Mise config schema
 * @see https://mise.jdx.dev/configuration/settings.html
 * @see https://raw.githubusercontent.com/jdx/mise/refs/heads/main/schema/mise.json
 */
export const miseConfigSchema = z.object({
  min_version: z.string().optional(),
  env: z
    .record(z.string(), z.any())
    .and(
      z.object({
        _: z
          .object({
            path: z.array(z.string()).optional(),
            file: z.array(z.string()).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  tools: z.record(z.string(), z.string().or(z.array(z.string()))).optional(),
  settings: z
    .object({
      idiomatic_version_file_enable_tools: z.array(z.string()).optional(),
      trusted_config_paths: z.array(z.string()).optional(),
    })
    .optional(),
});

export type MiseConfig = z.infer<typeof miseConfigSchema>;

export const miseGlobalConfig = {
  env: {
    BUN_BE_BUN: "1",
    _: {
      path: ["{{config_root}}/node_modules/.bin"],
    },
  },
  tools: {
    bun: "latest",
    sops: "latest",
    age: "latest",
    fd: "latest",
    fzf: "latest",
    jq: "latest",
  },
  settings: {
    trusted_config_paths: ["~/.dev"],
    idiomatic_version_file_enable_tools: [] as string[],
  },
} satisfies MiseConfig;

export const miseRepoConfig = {
  min_version: miseMinVersion,
  tools: {
    python: ["3.12", "latest"],
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
    const result = Bun.spawnSync(["mise", "--version"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.exitCode === 0 && result.stdout) {
      const output = result.stdout.toString().trim();

      if (isDebugMode()) {
        logger.debug("mise --version raw output:", output);
      }

      // Extract version from output - the version is typically on the last line like "2025.5.14 macos-arm64 (2025-05-26)"
      const lines = output.split("\n");
      for (const line of lines) {
        const trimmedLine = line.trim();
        // Look for a line that starts with a version pattern
        const match = trimmedLine.match(/^(\d+\.\d+\.\d+)/);
        if (match) {
          const version = match[1];
          if (isDebugMode()) {
            logger.debug(`Extracted mise version: ${version}`);
          }
          return version ?? null;
        }
      }

      if (isDebugMode()) {
        logger.debug("Failed to extract version from mise output");
      }
      return null;
    }

    if (isDebugMode()) {
      logger.debug(`mise --version failed with exit code: ${result.exitCode}`);
      if (result.stderr) {
        logger.debug(`stderr: ${result.stderr.toString()}`);
      }
    }
    return null;
  } catch (error: any) {
    if (isDebugMode()) {
      logger.debug(`Error getting mise version: ${error.message}`);
    }
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

  if (isDebugMode()) {
    logger.debug(`Version check: ${formatVersionComparison(currentVersion, miseMinVersion)}`);
  }

  return {
    isValid: comparison >= 0,
    currentVersion,
  };
};

/**
 * Runs mise self-update command with progress output and retry logic.
 *
 * @param retries - Number of retries to attempt (default: 3)
 * @returns Promise<boolean> - True if update was successful, false otherwise
 */
export const runMiseSelfUpdate = async (retries = 3): Promise<boolean> => {
  let attempt = 1;

  while (attempt <= retries) {
    try {
      if (attempt > 1) {
        logger.info(`🔄 Retry attempt ${attempt}/${retries}...`);
      }

      logger.info("⏳ Updating mise... (this may take a moment)");

      // Use streaming output for better user experience
      const process = Bun.spawn(["mise", "self-update"], {
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
                if (line.includes("Downloading") || line.includes("Installing") || line.includes("Updated")) {
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
        const newVersion = getCurrentMiseVersion();
        if (newVersion) {
          logger.success(`✅ Mise updated successfully to version ${newVersion}`);
        } else {
          logger.success(`✅ Mise update completed successfully`);
        }
        return true;
      } else {
        if (isDebugMode()) {
          logger.debug(`mise self-update exit code: ${exitCode}`);
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

        logger.error(`❌ Mise self-update failed with exit code: ${exitCode}`);
        if (errorOutput && !isDebugMode) {
          logger.error(`   Error: ${errorOutput.trim()}`);
        }
        return false;
      }
    } catch (error: any) {
      logger.error(`❌ Error running mise self-update: ${error.message}`);
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
 * Checks mise version and triggers upgrade if needed.
 * This should be called before running mise-related commands.
 *
 * @returns Promise<void> - Resolves if version is valid or upgrade succeeds
 */
export const ensureMiseVersionOrUpgrade = async (): Promise<void> => {
  const { isValid, currentVersion } = checkMiseVersion();

  if (isValid) {
    if (isDebugMode() && currentVersion) {
      logger.debug(`Mise version ${currentVersion} meets minimum requirement ${miseMinVersion}`);
    }
    return; // Version is fine, continue
  }

  if (currentVersion) {
    logger.warn(`⚠️  Mise version ${currentVersion} is older than required ${miseMinVersion}`);
    logger.info(`   ${formatVersionComparison(currentVersion, miseMinVersion)}`);
  } else {
    logger.warn(`⚠️  Unable to determine mise version`);
    logger.info(`   Expected version ${miseMinVersion} or newer`);
  }

  logger.info(`🚀 Starting mise upgrade...`);

  try {
    // Run mise self-update with retry logic
    const updateSuccess = await runMiseSelfUpdate();

    if (!updateSuccess) {
      logger.error(`❌ Failed to update mise to required version`);
      logger.error(`💡 Try manually upgrading mise:`);
      logger.error(`   • If installed via Homebrew: brew upgrade mise`);
      logger.error(`   • If installed via curl: curl https://mise.run | sh`);
      logger.error(`   • Visit: https://mise.jdx.dev/getting-started.html`);
      throw new ExternalToolError("Failed to update mise", {
        extra: { tool: "mise", requiredVersion: miseMinVersion, currentVersion },
      });
    }

    // After upgrade, check again
    const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = checkMiseVersion();

    if (!isValidAfterUpgrade) {
      logger.error(`❌ Mise upgrade completed but version still doesn't meet requirement`);
      if (versionAfterUpgrade) {
        logger.error(`   Current: ${versionAfterUpgrade}, Required: ${miseMinVersion}`);
      }
      logger.error(`💡 This might be due to:`);
      logger.error(`   • PATH issues - try 'which mise' to check location`);
      logger.error(`   • Multiple mise installations`);
      logger.error(`   • Package manager conflicts`);
      throw new ExternalToolError("Mise upgrade failed", {
        extra: {
          tool: "mise",
          requiredVersion: miseMinVersion,
          currentVersion: versionAfterUpgrade,
        },
      });
    }

    if (currentVersion && versionAfterUpgrade) {
      logger.success(`✨ Mise successfully upgraded: ${currentVersion} → ${versionAfterUpgrade}`);
    } else if (versionAfterUpgrade) {
      logger.success(`✨ Mise upgraded to version ${versionAfterUpgrade}`);
    }
  } catch (error: any) {
    // Re-throw ExternalToolError instances as-is to preserve specific error context
    if (error instanceof ExternalToolError) {
      throw error;
    }

    logger.error(`❌ Unexpected error during mise upgrade: ${error.message}`);
    if (isDebugMode()) {
      logger.debug(`Full error:`, error);
    }
    throw new ExternalToolError("Mise upgrade encountered an unexpected error", {
      extra: { tool: "mise", originalError: error.message },
    });
  }
};

/**
 * Sets up the global mise configuration.
 *
 * This function creates the mise config directory if it doesn't exist,
 * loads the baseline global mise TOML config, merges it with configuration
 * from the dev JSON config (tools, trusted_config_paths, and other settings),
 * and writes the final configuration to the mise config file.
 *
 * The merge process:
 * - Tools: dev config tools override/extend global config tools
 * - Trusted paths: arrays are merged and deduplicated
 * - Settings: arrays are merged and deduplicated, objects are merged
 *
 * @param force - If true, overwrite existing config file even if it exists
 * @returns Promise<void> Resolves when the configuration is set up successfully
 * @throws Error if the mise config cannot be parsed or written
 */
export async function setupMiseGlobalConfig(force = false) {
  try {
    logger.info("🎯 Setting up global mise configuration...");

    // Ensure mise config directory exists
    if (!fs.existsSync(globalMiseConfigDir)) {
      logger.info("   📂 Creating mise config directory...");
      fs.mkdirSync(globalMiseConfigDir, { recursive: true });
    }

    // Check if config already exists
    if (fs.existsSync(globalMiseConfigPath)) {
      if (isDebugMode()) {
        logger.debug(`   Config exists at: ${globalMiseConfigPath}`);
        try {
          const existingConfig = await Bun.file(globalMiseConfigPath).text();
          logger.debug("   Existing config preview:");
          const lines = existingConfig.split("\n").slice(0, 10);
          lines.forEach((line) => logger.debug(`     ${line}`));
          if (existingConfig.split("\n").length > 10) {
            logger.debug(`     ... (${existingConfig.split("\n").length - 10} more lines)`);
          }
        } catch {
          // Ignore read errors in debug mode
        }
      }

      if (force) {
        logger.info("   🔄 Force flag enabled, overwriting existing mise config...");
      } else {
        logger.info("   ✅ Mise config already exists");
        return;
      }
    }

    // Merge tools from dev config into global config
    if (devConfig.miseGlobalConfig?.tools && miseGlobalConfig.tools) {
      const mergedTools = { ...miseGlobalConfig.tools, ...devConfig.miseGlobalConfig.tools };
      miseGlobalConfig.tools = mergedTools;
      if (isDebugMode()) {
        const devConfigToolNames = Object.keys(devConfig.miseGlobalConfig.tools);
        logger.debug(`   Merging tools from dev config: ${devConfigToolNames.join(", ")}`);
      }
    }

    // Merge trusted_config_paths from dev config into global config
    if (devConfig.miseGlobalConfig?.settings?.trusted_config_paths && miseGlobalConfig.settings) {
      const existingPaths = miseGlobalConfig.settings.trusted_config_paths || [];
      const devConfigPaths = devConfig.miseGlobalConfig.settings.trusted_config_paths;

      // Merge arrays and remove duplicates
      const mergedPaths = [...new Set([...existingPaths, ...devConfigPaths])];
      miseGlobalConfig.settings.trusted_config_paths = mergedPaths;

      if (isDebugMode()) {
        logger.debug(`   Merging trusted paths: ${devConfigPaths.join(", ")}`);
        logger.debug(`   Final trusted paths: ${mergedPaths.join(", ")}`);
      }
    }

    // Merge other settings from dev config if they exist
    if (devConfig.miseGlobalConfig?.settings && miseGlobalConfig.settings) {
      // Merge idiomatic_version_file_enable_tools
      if (devConfig.miseGlobalConfig.settings.idiomatic_version_file_enable_tools) {
        const existingTools = miseGlobalConfig.settings.idiomatic_version_file_enable_tools || [];
        const devConfigTools = devConfig.miseGlobalConfig.settings.idiomatic_version_file_enable_tools;
        const mergedTools = [...new Set([...existingTools, ...devConfigTools])];
        miseGlobalConfig.settings.idiomatic_version_file_enable_tools = mergedTools;

        if (isDebugMode()) {
          logger.debug(`   Merging idiomatic version tools: ${devConfigTools.join(", ")}`);
        }
      }
    }

    logger.info("   📝 Writing configuration...");

    // Show key tools being configured
    const toolCount = Object.keys(miseGlobalConfig.tools || {}).length;
    logger.info(
      `   🔧 Configuring ${toolCount} tools: ${Object.keys(miseGlobalConfig.tools || {})
        .slice(0, 5)
        .join(", ")}${toolCount > 5 ? "..." : ""}`,
    );

    // Serialize the final config as TOML and write to file
    const tomlText = stringify(miseGlobalConfig);

    if (isDebugMode()) {
      logger.debug("   Generated TOML preview:");
      const lines = tomlText.split("\n").slice(0, 15);
      lines.forEach((line) => logger.debug(`     ${line}`));
      if (tomlText.split("\n").length > 15) {
        logger.debug(`     ... (${tomlText.split("\n").length - 15} more lines)`);
      }
    }

    await Bun.write(globalMiseConfigPath, tomlText + "\n");
    logger.success(`   ✅ Mise config installed at ${globalMiseConfigPath}`);

    // Provide helpful next steps
    logger.info("   💡 Run 'mise install' to install configured tools");
  } catch (err: any) {
    logger.error("❌ Error setting up mise configuration:", err.message);
    if (isDebugMode()) {
      logger.debug("Full error:", err);
    }

    // Provide helpful error recovery suggestions
    if (err.code === "EACCES" || err.code === "EPERM") {
      logger.error("💡 Permission denied. Try:");
      logger.error(`   • Check permissions on ${globalMiseConfigDir}`);
      logger.error(`   • Run with appropriate permissions`);
    } else if (err.code === "ENOSPC") {
      logger.error("💡 No space left on device");
    }

    throw err;
  }
}
