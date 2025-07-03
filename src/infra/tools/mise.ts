import path from "path";

import { stringify } from "@iarna/toml";
import { Context, Effect, Layer } from "effect";
import z from "zod/v4";

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

export const MISE_MIN_VERSION = "2024.12.11";

// Local constants that were previously imported from non-existent modules
const homeDir = process.env.HOME || process.env.USERPROFILE || "";

// Default dev config structure
const devConfig = {
  miseGlobalConfig: {
    tools: {},
    settings: {
      trusted_config_paths: [],
      idiomatic_version_file_enable_tools: [],
    },
  },
};

/**
 * Mise tools service for version checking and management
 * This is infrastructure-level tooling for mise version management
 */
export interface MiseToolsService {
  getCurrentVersion(): Effect.Effect<string | null, UnknownError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError>;
  performUpgrade(): Effect.Effect<boolean, UnknownError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | UnknownError>;
  setupGlobalConfig(): Effect.Effect<void, UnknownError>;
}

export class MiseToolsLive implements MiseToolsService {
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
    return this.shell.exec("mise", ["--version"]).pipe(
      Effect.map((result) => {
        if (result.exitCode === 0 && result.stdout) {
          const output = result.stdout.trim();
          // Mise version output is like "mise 2024.12.11"
          const match = output.match(/mise (\d{4}\.\d{1,2}\.\d{1,2})/);
          return match && match[1] ? match[1] : null;
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

        const comparison = this.compareVersions(currentVersion, MISE_MIN_VERSION);
        return {
          isValid: comparison >= 0,
          currentVersion,
        };
      }),
    );
  }

  performUpgrade(): Effect.Effect<boolean, UnknownError> {
    return Effect.gen(
      function* (this: MiseToolsLive) {
        yield* this.logger.info("⏳ Updating mise to latest version...");

        const result = yield* this.shell.exec("mise", ["self-update"]);

        if (result.exitCode === 0) {
          yield* this.logger.success("✅ Mise updated successfully");
          return true;
        } else {
          yield* this.logger.error(`❌ Mise update failed with exit code: ${result.exitCode}`);
          return false;
        }
      }.bind(this),
    );
  }

  setupGlobalConfig(): Effect.Effect<void, UnknownError> {
    return Effect.gen(
      function* (this: MiseToolsLive) {
        yield* this.logger.info("🔧 Setting up mise global configuration...");

        const miseConfigDir = path.join(homeDir, ".config", "mise");
        const miseConfigFile = path.join(miseConfigDir, "config.toml");

        // Create config directory if it doesn't exist
        const configDirExists = yield* this.filesystem.exists(miseConfigDir);
        if (!configDirExists) {
          yield* this.logger.info("   📂 Creating mise config directory...");
          yield* this.filesystem.mkdir(miseConfigDir, true).pipe(
            Effect.mapError((error) => {
              switch (error._tag) {
                case "FileSystemError":
                  return unknownError(`Failed to create mise config directory: ${error.reason}`);
                case "UnknownError":
                  return unknownError(`Failed to create mise config directory: ${String(error.reason)}`);
                default:
                  return unknownError(`Failed to create mise config directory: ${error}`);
              }
            }),
          );
        }

        // Write mise global config
        const config = devConfig.miseGlobalConfig;
        const tomlContent = stringify(config);

        yield* this.filesystem.writeFile(miseConfigFile, tomlContent).pipe(
          Effect.mapError((error) => {
            switch (error._tag) {
              case "FileSystemError":
                return unknownError(`Failed to write mise config: ${error.reason}`);
              case "UnknownError":
                return unknownError(`Failed to write mise config: ${String(error.reason)}`);
              default:
                return unknownError(`Failed to write mise config: ${error}`);
            }
          }),
        );
        yield* this.logger.info("   ✅ Mise global config ready");
      }.bind(this),
    );
  }

  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | UnknownError> {
    return Effect.gen(
      function* (this: MiseToolsLive) {
        const { isValid, currentVersion } = yield* this.checkVersion();

        if (isValid) {
          return;
        }

        if (currentVersion) {
          yield* this.logger.warn(`⚠️  Mise version ${currentVersion} is older than required ${MISE_MIN_VERSION}`);
        } else {
          yield* this.logger.warn(`⚠️  Unable to determine mise version`);
        }

        yield* this.logger.info(`🚀 Starting mise upgrade...`);

        const updateSuccess = yield* this.performUpgrade();
        if (!updateSuccess) {
          yield* this.logger.error(`❌ Failed to update mise to required version`);
          yield* this.logger.error(`💡 Try manually updating mise: mise self-update`);
          return yield* Effect.fail(
            externalToolError("Failed to update mise", {
              tool: "mise",
              exitCode: 1,
              stderr: `Required version: ${MISE_MIN_VERSION}, Current: ${currentVersion}`,
            }),
          );
        }

        // Verify upgrade
        const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* this.checkVersion();
        if (!isValidAfterUpgrade) {
          yield* this.logger.error(`❌ Mise upgrade completed but version still doesn't meet requirement`);
          if (versionAfterUpgrade) {
            yield* this.logger.error(`   Current: ${versionAfterUpgrade}, Required: ${MISE_MIN_VERSION}`);
          }
          return yield* Effect.fail(
            externalToolError("Mise upgrade failed", {
              tool: "mise",
              exitCode: 1,
              stderr: `Required: ${MISE_MIN_VERSION}, Got: ${versionAfterUpgrade}`,
            }),
          );
        }

        if (versionAfterUpgrade) {
          yield* this.logger.success(`✨ Mise successfully upgraded to version ${versionAfterUpgrade}`);
        }
      }.bind(this),
    );
  }
}

// Service tag for Effect Context system
export class MiseToolsServiceTag extends Context.Tag("MiseToolsService")<MiseToolsServiceTag, MiseToolsService>() {}

// Effect Layer for dependency injection
export const MiseToolsLiveLayer = Layer.effect(
  MiseToolsServiceTag,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    const logger = yield* LoggerService;
    const filesystem = yield* FileSystemService;
    return new MiseToolsLive(shell, logger, filesystem);
  }),
);
