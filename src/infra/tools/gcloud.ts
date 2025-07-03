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
  setupConfig(): Effect.Effect<void, UnknownError | ConfigError>;
}

export class GcloudToolsLive implements GcloudToolsService {
  constructor(
    private shell: Shell,
    private logger: Logger,
    private filesystem: FileSystem,
  ) {}

  private compareVersions = (version1: string, version2: string): number => {
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

  getCurrentVersion(): Effect.Effect<string | null, UnknownError> {
    return this.shell.exec("gcloud", ["version"]).pipe(
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
  }

  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError> {
    return this.getCurrentVersion().pipe(
      Effect.map((currentVersion) => {
        if (!currentVersion) {
          return { isValid: false, currentVersion: null };
        }

        const comparison = this.compareVersions(currentVersion, GCLOUD_MIN_VERSION);
        return {
          isValid: comparison >= 0,
          currentVersion,
        };
      }),
    );
  }

  performUpgrade(): Effect.Effect<boolean, UnknownError> {
    return Effect.gen(
      function* (this: GcloudToolsLive) {
        yield* this.logger.info("⏳ Updating gcloud via mise...");

        const result = yield* this.shell.exec("mise", ["install", "gcloud@latest"]);

        if (result.exitCode === 0) {
          yield* this.logger.success("✅ Gcloud updated successfully via mise");
          return true;
        } else {
          yield* this.logger.error(`❌ Gcloud update failed with exit code: ${result.exitCode}`);
          return false;
        }
      }.bind(this),
    );
  }

  setupConfig(): Effect.Effect<void, UnknownError | ConfigError> {
    return Effect.gen(
      function* (this: GcloudToolsLive) {
        yield* this.logger.info("☁️  Setting up Google Cloud configuration...");

        const homeDir = process.env.HOME || process.env.USERPROFILE || "";
        const gcloudConfigDir = `${homeDir}/.config/gcloud`;

        const exists = yield* this.filesystem.exists(gcloudConfigDir);
        if (!exists) {
          yield* this.logger.info("   📂 Creating gcloud config directory...");
          yield* this.filesystem
            .mkdir(gcloudConfigDir, true)
            .pipe(
              Effect.catchTag("ConfigError", (error) =>
                Effect.fail(unknownError(`Failed to create directory: ${error.reason}`)),
              ),
            );
        }

        yield* this.logger.info("   ✅ Google Cloud config ready");
      }.bind(this),
    );
  }

  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | UnknownError> {
    return Effect.gen(
      function* (this: GcloudToolsLive) {
        const { isValid, currentVersion } = yield* this.checkVersion();

        if (isValid) {
          return;
        }

        if (currentVersion) {
          yield* this.logger.warn(`⚠️  Gcloud version ${currentVersion} is older than required ${GCLOUD_MIN_VERSION}`);
        } else {
          yield* this.logger.warn(`⚠️  Unable to determine gcloud version`);
        }

        yield* this.logger.info(`🚀 Starting gcloud upgrade via mise...`);

        const updateSuccess = yield* this.performUpgrade();
        if (!updateSuccess) {
          yield* this.logger.error(`❌ Failed to update gcloud to required version`);
          yield* this.logger.error(`💡 Try manually installing gcloud via mise: mise install gcloud@latest`);
          return yield* Effect.fail(
            externalToolError("Failed to update gcloud", {
              tool: "gcloud",
              exitCode: 1,
              stderr: `Required version: ${GCLOUD_MIN_VERSION}, Current: ${currentVersion}`,
            }),
          );
        }

        // Verify upgrade
        const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* this.checkVersion();
        if (!isValidAfterUpgrade) {
          yield* this.logger.error(`❌ Gcloud upgrade completed but version still doesn't meet requirement`);
          if (versionAfterUpgrade) {
            yield* this.logger.error(`   Current: ${versionAfterUpgrade}, Required: ${GCLOUD_MIN_VERSION}`);
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
          yield* this.logger.success(`✨ Gcloud successfully upgraded to version ${versionAfterUpgrade}`);
        }
      }.bind(this),
    );
  }
}

// Service tag for Effect Context system
export class GcloudToolsServiceTag extends Context.Tag("GcloudToolsService")<
  GcloudToolsServiceTag,
  GcloudToolsService
>() {}

// Effect Layer for dependency injection
export const GcloudToolsLiveLayer = Layer.effect(
  GcloudToolsServiceTag,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    const logger = yield* LoggerService;
    const filesystem = yield* FileSystemService;
    return new GcloudToolsLive(shell, logger, filesystem);
  }),
);
