import path from "path";

import { stringify } from "@iarna/toml";
import { Context, Effect, Layer } from "effect";

import devConfig from "../../config/mise-dev-config.json" with { type: "json" };
import { externalToolError, unknownError, type ExternalToolError, type UnknownError } from "../../domain/errors";
import { FileSystemPortTag, type FileSystemPort } from "../../domain/ports/file-system-port";
import { ShellPortTag, type ShellPort } from "../../domain/ports/shell-port";

export const MISE_MIN_VERSION = "2024.11.0";

const homeDir = process.env.HOME || process.env.USERPROFILE || "";

/**
 * Mise tools for version checking and management
 * This is infrastructure-level tooling for mise version management
 */
export interface MiseTools {
  getCurrentVersion(): Effect.Effect<string | null, UnknownError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError>;
  performUpgrade(): Effect.Effect<boolean, UnknownError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | UnknownError>;
  setupGlobalConfig(): Effect.Effect<void, UnknownError>;
}

// Factory function that creates MiseTools with dependencies
export const makeMiseToolsLive = (shell: ShellPort, filesystem: FileSystemPort): MiseTools => {
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
    shell.exec("mise", ["--version"]).pipe(
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

  const checkVersion = (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError> =>
    getCurrentVersion().pipe(
      Effect.map((currentVersion) => {
        if (!currentVersion) {
          return { isValid: false, currentVersion: null };
        }

        const comparison = compareVersions(currentVersion, MISE_MIN_VERSION);
        return {
          isValid: comparison >= 0,
          currentVersion,
        };
      }),
    );

  const performUpgrade = (): Effect.Effect<boolean, UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("⏳ Updating mise to latest version...");

      const result = yield* shell.exec("mise", ["self-update"]);

      if (result.exitCode === 0) {
        yield* Effect.logInfo("✅ Mise updated successfully");
        return true;
      } else {
        yield* Effect.logError(`❌ Mise update failed with exit code: ${result.exitCode}`);
        return false;
      }
    });

  const setupGlobalConfig = (): Effect.Effect<void, UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("🔧 Setting up mise global configuration...");

      const miseConfigDir = path.join(homeDir, ".config", "mise");
      const miseConfigFile = path.join(miseConfigDir, "config.toml");

      // Create config directory if it doesn't exist
      const configDirExists = yield* filesystem.exists(miseConfigDir);
      if (!configDirExists) {
        yield* Effect.logDebug("   📂 Creating mise config directory...");
        yield* filesystem.mkdir(miseConfigDir, true).pipe(
          Effect.mapError((error) => {
            return unknownError(`Failed to create mise config directory: ${error}`);
          }),
        );
      }

      // Write mise global config
      const config = devConfig.miseGlobalConfig;
      const tomlContent = stringify(config);

      yield* filesystem.writeFile(miseConfigFile, tomlContent).pipe(
        Effect.mapError((error) => {
          return unknownError(`Failed to write mise config: ${error}`);
        }),
      );
      yield* Effect.logDebug("   ✅ Mise global config ready");
    });

  const ensureVersionOrUpgrade = (): Effect.Effect<void, ExternalToolError | UnknownError> =>
    Effect.gen(function* () {
      const { isValid, currentVersion } = yield* checkVersion();

      if (isValid) {
        return;
      }

      if (currentVersion) {
        yield* Effect.logWarning(`⚠️  Mise version ${currentVersion} is older than required ${MISE_MIN_VERSION}`);
      } else {
        yield* Effect.logWarning(`⚠️  Unable to determine mise version`);
      }

      yield* Effect.logInfo(`🚀 Starting mise upgrade...`);

      const updateSuccess = yield* performUpgrade();
      if (!updateSuccess) {
        yield* Effect.logError(`❌ Failed to update mise to required version`);
        yield* Effect.logError(`💡 Try manually updating mise: mise self-update`);
        return yield* Effect.fail(
          externalToolError("Failed to update mise", {
            tool: "mise",
            exitCode: 1,
            stderr: `Required version: ${MISE_MIN_VERSION}, Current: ${currentVersion}`,
          }),
        );
      }

      yield* setupGlobalConfig();

      const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* checkVersion();
      if (!isValidAfterUpgrade) {
        yield* Effect.logError(`❌ Mise upgrade completed but version still doesn't meet requirement`);
        if (versionAfterUpgrade) {
          yield* Effect.logError(`   Current: ${versionAfterUpgrade}, Required: ${MISE_MIN_VERSION}`);
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
        yield* Effect.logInfo(`✨ Mise successfully upgraded to version ${versionAfterUpgrade}`);
      }
    });

  return {
    getCurrentVersion,
    checkVersion,
    performUpgrade,
    ensureVersionOrUpgrade,
    setupGlobalConfig,
  };
};

// Service tag for Effect Context system
export class MiseToolsTag extends Context.Tag("MiseTools")<MiseToolsTag, MiseTools>() {}

// Effect Layer for dependency injection using factory function
export const MiseToolsLiveLayer = Layer.effect(
  MiseToolsTag,
  Effect.gen(function* () {
    const shell = yield* ShellPortTag;
    const filesystem = yield* FileSystemPortTag;
    return makeMiseToolsLive(shell, filesystem);
  }),
);
