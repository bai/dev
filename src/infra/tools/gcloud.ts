import path from "path";

import { Context, Effect, Layer } from "effect";

import {
  externalToolError,
  unknownError,
  type ConfigError,
  type ExternalToolError,
  type UnknownError,
} from "../../domain/errors";
import { FileSystemPortTag, type FileSystemPort } from "../../domain/ports/file-system-port";
import { ShellPortTag, type ShellPort } from "../../domain/ports/shell-port";

export const GCLOUD_MIN_VERSION = "450.0.0";

/**
 * Google Cloud tools for version checking and management
 * This is infrastructure-level tooling for gcloud version management
 */
export interface GcloudTools {
  getCurrentVersion(): Effect.Effect<string | null, UnknownError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError>;
  performUpgrade(): Effect.Effect<boolean, UnknownError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | UnknownError>;
  setupConfig(): Effect.Effect<void, UnknownError>;
}

// Factory function that creates GcloudTools with dependencies
export const makeGcloudToolsLive = (shell: ShellPort, filesystem: FileSystemPort): GcloudTools => {
  // Helper function for version comparison
  const compareVersions = (version1: string, version2: string): number => {
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

  // Individual functions implementing the service methods
  const getCurrentVersion = (): Effect.Effect<string | null, UnknownError> =>
    shell.exec("gcloud", ["version"]).pipe(
      Effect.map((result) => {
        if (result.exitCode === 0 && result.stdout) {
          const output = result.stdout.trim();
          // Gcloud version output contains "Google Cloud SDK 450.0.0"
          const match = output.match(/Google Cloud SDK (\d+\.\d+\.\d+)/);
          if (match && match[1]) {
            return match[1];
          }
          // Fallback: look for any version pattern
          const fallbackMatch = output.match(/(\d+\.\d+\.\d+)/);
          return fallbackMatch && fallbackMatch[1] ? fallbackMatch[1] : null;
        }
        return null;
      }),
      Effect.catchAll(() => Effect.succeed(null)),
    );

  const checkVersion = (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError> =>
    getCurrentVersion().pipe(
      Effect.map((currentVersion) => {
        if (!currentVersion) {
          return { isValid: false, currentVersion: null };
        }

        const comparison = compareVersions(currentVersion, GCLOUD_MIN_VERSION);
        return {
          isValid: comparison >= 0,
          currentVersion,
        };
      }),
    );

  const performUpgrade = (): Effect.Effect<boolean, UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("⏳ Updating gcloud via mise...");

      const result = yield* shell.exec("mise", ["install", "gcloud@latest"]);

      if (result.exitCode === 0) {
        yield* Effect.logInfo("✅ Gcloud updated successfully via mise");
        return true;
      } else {
        yield* Effect.logError(`❌ Gcloud update failed with exit code: ${result.exitCode}`);
        return false;
      }
    });

  const setupConfig = (): Effect.Effect<void, UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("☁️  Setting up Google Cloud configuration...");

      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      const gcloudConfigDir = path.join(homeDir, ".config", "gcloud");

      // Create config directory if it doesn't exist
      const exists = yield* filesystem.exists(gcloudConfigDir);
      if (!exists) {
        yield* Effect.logInfo("   📂 Creating gcloud config directory...");
        yield* filesystem.mkdir(gcloudConfigDir, true).pipe(
          Effect.mapError((error) => {
            return unknownError(`Failed to create gcloud config directory: ${error}`);
          }),
        );
      }

      yield* Effect.logInfo("   ✅ Google Cloud config ready");
    });

  const ensureVersionOrUpgrade = (): Effect.Effect<void, ExternalToolError | UnknownError> =>
    Effect.gen(function* () {
      const { isValid, currentVersion } = yield* checkVersion();

      if (isValid) {
        return;
      }

      if (currentVersion) {
        yield* Effect.logWarning(`⚠️  Gcloud version ${currentVersion} is older than required ${GCLOUD_MIN_VERSION}`);
      } else {
        yield* Effect.logWarning(`⚠️  Unable to determine gcloud version`);
      }

      yield* Effect.logInfo(`🚀 Starting gcloud upgrade via mise...`);

      const updateSuccess = yield* performUpgrade();
      if (!updateSuccess) {
        yield* Effect.logError(`❌ Failed to update gcloud to required version`);
        yield* Effect.logError(`💡 Try manually installing gcloud via mise: mise install gcloud@latest`);
        return yield* Effect.fail(
          externalToolError("Failed to update gcloud", {
            tool: "gcloud",
            exitCode: 1,
            stderr: `Required version: ${GCLOUD_MIN_VERSION}, Current: ${currentVersion}`,
          }),
        );
      }

      yield* setupConfig();

      const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* checkVersion();
      if (!isValidAfterUpgrade) {
        yield* Effect.logError(`❌ Gcloud upgrade completed but version still doesn't meet requirement`);
        if (versionAfterUpgrade) {
          yield* Effect.logError(`   Current: ${versionAfterUpgrade}, Required: ${GCLOUD_MIN_VERSION}`);
        }
        return yield* Effect.fail(
          externalToolError("Gcloud upgrade failed", {
            tool: "gcloud",
            exitCode: 1,
            stderr: `Required: ${GCLOUD_MIN_VERSION}, Got: ${versionAfterUpgrade}`,
          }),
        );
      }

      if (versionAfterUpgrade) {
        yield* Effect.logInfo(`✨ Gcloud successfully upgraded to version ${versionAfterUpgrade}`);
      }
    });

  return {
    getCurrentVersion,
    checkVersion,
    performUpgrade,
    ensureVersionOrUpgrade,
    setupConfig,
  };
};

// Service tag for Effect Context system
export class GcloudToolsTag extends Context.Tag("GcloudTools")<GcloudToolsTag, GcloudTools>() {}

// Effect Layer for dependency injection using factory function
export const GcloudToolsLiveLayer = Layer.effect(
  GcloudToolsTag,
  Effect.gen(function* () {
    const shell = yield* ShellPortTag;
    const filesystem = yield* FileSystemPortTag;
    return makeGcloudToolsLive(shell, filesystem);
  }),
);
