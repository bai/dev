import { Context, Effect, Layer } from "effect";

import { externalToolError, type ExternalToolError, type UnknownError } from "../../domain/errors";
import { LoggerService, type Logger } from "../../domain/models";
import { ShellService, type Shell } from "../../domain/ports/Shell";

export const FZF_MIN_VERSION = "0.35.0";

/**
 * Fzf tools service for version checking and management
 * This is infrastructure-level tooling for fzf version management
 */
export interface FzfToolsService {
  getCurrentVersion(): Effect.Effect<string | null, UnknownError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError>;
  performUpgrade(): Effect.Effect<boolean, UnknownError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | UnknownError>;
}

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

// Factory function to create FzfToolsService implementation
export const makeFzfToolsLive = (shell: Shell, logger: Logger): FzfToolsService => ({
  getCurrentVersion: (): Effect.Effect<string | null, UnknownError> =>
    shell.exec("fzf", ["--version"]).pipe(
      Effect.map((result) => {
        if (result.exitCode === 0 && result.stdout) {
          const output = result.stdout.trim();
          // Fzf version output is like "0.35.0 (homebrew)"
          const match = output.match(/(\d+\.\d+\.\d+)/);
          return match && match[1] ? match[1] : null;
        }
        return null;
      }),
      Effect.catchAll(() => Effect.succeed(null)),
    ),

  checkVersion: (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError> =>
    Effect.gen(function* () {
      const fzfTools = makeFzfToolsLive(shell, logger);
      const currentVersion = yield* fzfTools.getCurrentVersion();

      if (!currentVersion) {
        return { isValid: false, currentVersion: null };
      }

      const comparison = compareVersions(currentVersion, FZF_MIN_VERSION);
      return {
        isValid: comparison >= 0,
        currentVersion,
      };
    }),

  performUpgrade: (): Effect.Effect<boolean, UnknownError> =>
    Effect.gen(function* () {
      yield* logger.info("⏳ Updating fzf via mise...");

      const result = yield* shell.exec("mise", ["install", "fzf@latest"]);

      if (result.exitCode === 0) {
        yield* logger.success("✅ Fzf updated successfully via mise");
        return true;
      } else {
        yield* logger.error(`❌ Fzf update failed with exit code: ${result.exitCode}`);
        return false;
      }
    }),

  ensureVersionOrUpgrade: (): Effect.Effect<void, ExternalToolError | UnknownError> =>
    Effect.gen(function* () {
      const fzfTools = makeFzfToolsLive(shell, logger);
      const { isValid, currentVersion } = yield* fzfTools.checkVersion();

      if (isValid) {
        return;
      }

      if (currentVersion) {
        yield* logger.warn(`⚠️  Fzf version ${currentVersion} is older than required ${FZF_MIN_VERSION}`);
      } else {
        yield* logger.warn(`⚠️  Unable to determine fzf version`);
      }

      yield* logger.info(`🚀 Starting fzf upgrade via mise...`);

      const updateSuccess = yield* fzfTools.performUpgrade();
      if (!updateSuccess) {
        yield* logger.error(`❌ Failed to update fzf to required version`);
        yield* logger.error(`💡 Try manually installing fzf via mise: mise install fzf@latest`);
        return yield* Effect.fail(
          externalToolError("Failed to update fzf", {
            tool: "fzf",
            exitCode: 1,
            stderr: `Required version: ${FZF_MIN_VERSION}, Current: ${currentVersion}`,
          }),
        );
      }

      // Verify upgrade
      const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* fzfTools.checkVersion();
      if (!isValidAfterUpgrade) {
        yield* logger.error(`❌ Fzf upgrade completed but version still doesn't meet requirement`);
        if (versionAfterUpgrade) {
          yield* logger.error(`   Current: ${versionAfterUpgrade}, Required: ${FZF_MIN_VERSION}`);
        }
        return yield* Effect.fail(
          externalToolError("Fzf upgrade failed", {
            tool: "fzf",
            exitCode: 1,
            stderr: `Required: ${FZF_MIN_VERSION}, Got: ${versionAfterUpgrade}`,
          }),
        );
      }

      if (versionAfterUpgrade) {
        yield* logger.success(`✨ Fzf successfully upgraded to version ${versionAfterUpgrade}`);
      }
    }),
});

// Service tag for Effect Context system
export class FzfToolsServiceTag extends Context.Tag("FzfToolsService")<FzfToolsServiceTag, FzfToolsService>() {}

// Effect Layer for dependency injection
export const FzfToolsLiveLayer = Layer.effect(
  FzfToolsServiceTag,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    const logger = yield* LoggerService;
    return makeFzfToolsLive(shell, logger);
  }),
);
