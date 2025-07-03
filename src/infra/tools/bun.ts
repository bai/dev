import { Context, Effect, Layer } from "effect";

import { externalToolError, type ExternalToolError, type UnknownError } from "../../domain/errors";
import { ShellService, type Shell } from "../../domain/ports/Shell";

export const BUN_MIN_VERSION = "1.2.0";

/**
 * Bun tools service for version checking and management
 * This is infrastructure-level tooling for bun version management
 */
export interface BunToolsService {
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

// Factory function to create BunToolsService implementation
export const makeBunToolsLive = (shell: Shell): BunToolsService => ({
  getCurrentVersion: (): Effect.Effect<string | null, UnknownError> =>
    shell.exec("bun", ["--version"]).pipe(
      Effect.map((result) => {
        if (result.exitCode === 0 && result.stdout) {
          const output = result.stdout.trim();
          // Bun version output is like "1.2.18"
          const match = output.match(/(\d+\.\d+\.\d+)/);
          return match && match[1] ? match[1] : null;
        }
        return null;
      }),
      Effect.catchAll(() => Effect.succeed(null)),
    ),

  checkVersion: (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError> =>
    Effect.gen(function* () {
      const bunTools = makeBunToolsLive(shell);
      const currentVersion = yield* bunTools.getCurrentVersion();

      if (!currentVersion) {
        return { isValid: false, currentVersion: null };
      }

      const comparison = compareVersions(currentVersion, BUN_MIN_VERSION);
      return {
        isValid: comparison >= 0,
        currentVersion,
      };
    }),

  performUpgrade: (): Effect.Effect<boolean, UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("⏳ Updating bun...");

      const result = yield* shell.exec("bun", ["upgrade"]);

      if (result.exitCode === 0) {
        yield* Effect.logInfo("✅ Bun updated successfully");
        return true;
      } else {
        yield* Effect.logError(`❌ Bun update failed with exit code: ${result.exitCode}`);
        return false;
      }
    }),

  ensureVersionOrUpgrade: (): Effect.Effect<void, ExternalToolError | UnknownError> =>
    Effect.gen(function* () {
      const bunTools = makeBunToolsLive(shell);
      const { isValid, currentVersion } = yield* bunTools.checkVersion();

      if (isValid) {
        return;
      }

      if (currentVersion) {
        yield* Effect.logWarning(`⚠️  Bun version ${currentVersion} is older than required ${BUN_MIN_VERSION}`);
      } else {
        yield* Effect.logWarning(`⚠️  Unable to determine bun version`);
      }

      yield* Effect.logInfo(`🚀 Starting bun upgrade...`);

      const updateSuccess = yield* bunTools.performUpgrade();
      if (!updateSuccess) {
        yield* Effect.logError(`❌ Failed to update bun to required version`);
        return yield* Effect.fail(
          externalToolError("Failed to update bun", {
            tool: "bun",
            exitCode: 1,
            stderr: `Required version: ${BUN_MIN_VERSION}, Current: ${currentVersion}`,
          }),
        );
      }

      const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* bunTools.checkVersion();
      if (!isValidAfterUpgrade) {
        yield* Effect.logError(`❌ Bun upgrade completed but version still doesn't meet requirement`);
        if (versionAfterUpgrade) {
          yield* Effect.logError(`   Current: ${versionAfterUpgrade}, Required: ${BUN_MIN_VERSION}`);
        }
        return yield* Effect.fail(
          externalToolError("Bun upgrade failed", {
            tool: "bun",
            exitCode: 1,
            stderr: `Required: ${BUN_MIN_VERSION}, Got: ${versionAfterUpgrade}`,
          }),
        );
      }

      if (versionAfterUpgrade) {
        yield* Effect.logInfo(`✨ Bun successfully upgraded to version ${versionAfterUpgrade}`);
      }
    }),
});

// Service tag for Effect Context system
export class BunToolsServiceTag extends Context.Tag("BunToolsService")<BunToolsServiceTag, BunToolsService>() {}

// Effect Layer for dependency injection
export const BunToolsServiceLive = Layer.effect(
  BunToolsServiceTag,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    return makeBunToolsLive(shell);
  }),
);
