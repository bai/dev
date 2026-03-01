import { Clock, Context, Effect, Layer } from "effect";

import {
  externalToolError,
  healthCheckError,
  type ExternalToolError,
  type HealthCheckError,
  type ShellExecutionError,
} from "../domain/errors";
import { type HealthCheckResult } from "../domain/health-check-port";
import { ShellTag, type Shell } from "../domain/shell-port";

export const BUN_MIN_VERSION = "1.3.6";

/**
 * Bun tools for version checking and management
 * This is infrastructure-level tooling for bun version management
 */
export interface BunTools {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
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

// Factory function to create BunTools implementation
export const makeBunToolsLive = (shell: Shell): BunTools => ({
  getCurrentVersion: (): Effect.Effect<string | null, ShellExecutionError> =>
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
      Effect.orElseSucceed(() => null),
    ),

  checkVersion: (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError> =>
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

  performUpgrade: (): Effect.Effect<boolean, ShellExecutionError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("🔄 Updating bun...");

      const result = yield* shell.exec("bun", ["upgrade"]);

      if (result.exitCode === 0) {
        yield* Effect.logInfo("✅ Bun updated successfully");
        return true;
      } else {
        yield* Effect.logError(`❌ Bun update failed with exit code: ${result.exitCode}`);
        if (result.stderr) {
          yield* Effect.logError(`   stderr: ${result.stderr}`);
        }
        return false;
      }
    }),

  ensureVersionOrUpgrade: (): Effect.Effect<void, ExternalToolError | ShellExecutionError> =>
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
        return yield* externalToolError("Failed to update bun", {
          tool: "bun",
          exitCode: 1,
          stderr: `Required version: ${BUN_MIN_VERSION}, Current: ${currentVersion}`,
        });
      }

      const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* bunTools.checkVersion();
      if (!isValidAfterUpgrade) {
        yield* Effect.logError(`❌ Bun upgrade completed but version still doesn't meet requirement`);
        if (versionAfterUpgrade) {
          yield* Effect.logError(`   Current: ${versionAfterUpgrade}, Required: ${BUN_MIN_VERSION}`);
        }
        return yield* externalToolError("Bun upgrade failed", {
          tool: "bun",
          exitCode: 1,
          stderr: `Required: ${BUN_MIN_VERSION}, Got: ${versionAfterUpgrade}`,
        });
      }

      if (versionAfterUpgrade) {
        yield* Effect.logInfo(`✨ Bun successfully upgraded to version ${versionAfterUpgrade}`);
      }
    }),

  performHealthCheck: (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    Effect.gen(function* () {
      const bunTools = makeBunToolsLive(shell);
      const checkedAt = new Date(yield* Clock.currentTimeMillis);

      const currentVersion = yield* bunTools
        .getCurrentVersion()
        .pipe(Effect.mapError(() => healthCheckError("Failed to get bun version", "bun")));

      if (!currentVersion) {
        return {
          toolName: "bun",
          status: "fail",
          notes: "Bun not found or unable to determine version",
          checkedAt,
        };
      }

      const isCompliant = compareVersions(currentVersion, BUN_MIN_VERSION) >= 0;
      if (!isCompliant) {
        return {
          toolName: "bun",
          version: currentVersion,
          status: "warning",
          notes: `requires >=${BUN_MIN_VERSION}`,
          checkedAt,
        };
      }

      return {
        toolName: "bun",
        version: currentVersion,
        status: "ok",
        checkedAt,
      };
    }),
});

// Service tag for Effect Context system
export class BunToolsTag extends Context.Tag("BunTools")<BunToolsTag, BunTools>() {}

// Effect Layer for dependency injection
export const BunToolsLiveLayer = Layer.effect(
  BunToolsTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeBunToolsLive(shell);
  }),
);
