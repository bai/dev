import { Context, Effect, Layer } from "effect";

import {
  externalToolError,
  unknownError,
  type ConfigError,
  type ExternalToolError,
  type UnknownError,
} from "../../domain/errors";
import { LoggerService, type Logger } from "../../domain/models";
import { FileSystemService, type FileSystem } from "../../domain/ports/FileSystem";
import { ShellService, type Shell } from "../../domain/ports/Shell";

export const GCLOUD_MIN_VERSION = "450.0.0";

/**
 * Google Cloud tools service for version checking and management
 * This is infrastructure-level tooling for gcloud version management
 */
export interface GcloudToolsService {
  getCurrentVersion(): Effect.Effect<string | null, UnknownError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError>;
  performUpgrade(): Effect.Effect<boolean, UnknownError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | UnknownError>;
  setupConfig(): Effect.Effect<void, UnknownError>;
}

// Factory function that creates GcloudToolsService with dependencies
export const makeGcloudToolsLive = (shell: Shell, logger: Logger, filesystem: FileSystem): GcloudToolsService => {
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
      yield* logger.info("⏳ Updating gcloud via mise...");

      const result = yield* shell.exec("mise", ["install", "gcloud@latest"]);

      if (result.exitCode === 0) {
        yield* logger.success("✅ Gcloud updated successfully via mise");
        return true;
      } else {
        yield* logger.error(`❌ Gcloud update failed with exit code: ${result.exitCode}`);
        return false;
      }
    });

  const setupConfig = (): Effect.Effect<void, UnknownError> =>
    Effect.gen(function* () {
      yield* logger.info("☁️  Setting up Google Cloud configuration...");

      const homeDir = process.env.HOME || process.env.USERPROFILE || "";
      const gcloudConfigDir = `${homeDir}/.config/gcloud`;

      const exists = yield* filesystem.exists(gcloudConfigDir);
      if (!exists) {
        yield* logger.info("   📂 Creating gcloud config directory...");
        yield* filesystem.mkdir(gcloudConfigDir, true).pipe(
          Effect.mapError((error) => {
            switch (error._tag) {
              case "FileSystemError":
                return unknownError(`Failed to create directory: ${error.reason}`);
              case "UnknownError":
                return unknownError(`Failed to create directory: ${String(error.reason)}`);
              default:
                return unknownError(`Failed to create directory: ${error}`);
            }
          }),
        );
      }

      yield* logger.info("   ✅ Google Cloud config ready");
    });

  const ensureVersionOrUpgrade = (): Effect.Effect<void, ExternalToolError | UnknownError> =>
    Effect.gen(function* () {
      const { isValid, currentVersion } = yield* checkVersion();

      if (isValid) {
        return;
      }

      if (currentVersion) {
        yield* logger.warn(`⚠️  Gcloud version ${currentVersion} is older than required ${GCLOUD_MIN_VERSION}`);
      } else {
        yield* logger.warn(`⚠️  Unable to determine gcloud version`);
      }

      yield* logger.info(`🚀 Starting gcloud upgrade via mise...`);

      const updateSuccess = yield* performUpgrade();
      if (!updateSuccess) {
        yield* logger.error(`❌ Failed to update gcloud to required version`);
        yield* logger.error(`💡 Try manually installing gcloud via mise: mise install gcloud@latest`);
        return yield* Effect.fail(
          externalToolError("Failed to update gcloud", {
            tool: "gcloud",
            exitCode: 1,
            stderr: `Required version: ${GCLOUD_MIN_VERSION}, Current: ${currentVersion}`,
          }),
        );
      }

      // Verify upgrade
      const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* checkVersion();
      if (!isValidAfterUpgrade) {
        yield* logger.error(`❌ Gcloud upgrade completed but version still doesn't meet requirement`);
        if (versionAfterUpgrade) {
          yield* logger.error(`   Current: ${versionAfterUpgrade}, Required: ${GCLOUD_MIN_VERSION}`);
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
        yield* logger.success(`✨ Gcloud successfully upgraded to version ${versionAfterUpgrade}`);
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
export class GcloudToolsServiceTag extends Context.Tag("GcloudToolsService")<
  GcloudToolsServiceTag,
  GcloudToolsService
>() {}

// Effect Layer for dependency injection using factory function
export const GcloudToolsLiveLayer = Layer.effect(
  GcloudToolsServiceTag,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    const logger = yield* LoggerService;
    const filesystem = yield* FileSystemService;
    return makeGcloudToolsLive(shell, logger, filesystem);
  }),
);
