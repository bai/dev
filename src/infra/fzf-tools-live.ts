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

export const FZF_MIN_VERSION = "0.67.0";

/**
 * Fzf tools for version checking and management
 * This is infrastructure-level tooling for fzf version management
 */
export interface FzfTools {
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

// Factory function to create FzfTools implementation
export const makeFzfToolsLive = (shell: Shell): FzfTools => ({
  getCurrentVersion: (): Effect.Effect<string | null, ShellExecutionError> =>
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
      Effect.orElseSucceed(() => null),
    ),

  checkVersion: (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError> =>
    Effect.gen(function* () {
      const fzfTools = makeFzfToolsLive(shell);
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

  performUpgrade: (): Effect.Effect<boolean, ShellExecutionError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("🔄 Updating fzf via mise...");

      const result = yield* shell.exec("mise", ["install", "fzf@latest"]);

      if (result.exitCode === 0) {
        yield* Effect.logInfo("✅ Fzf updated successfully via mise");
        return true;
      } else {
        yield* Effect.logError(`❌ Fzf update failed with exit code: ${result.exitCode}`);
        return false;
      }
    }),

  ensureVersionOrUpgrade: (): Effect.Effect<void, ExternalToolError | ShellExecutionError> =>
    Effect.gen(function* () {
      const fzfTools = makeFzfToolsLive(shell);
      const { isValid, currentVersion } = yield* fzfTools.checkVersion();

      if (isValid) {
        return;
      }

      if (currentVersion) {
        yield* Effect.logWarning(`⚠️  Fzf version ${currentVersion} is older than required ${FZF_MIN_VERSION}`);
      } else {
        yield* Effect.logWarning(`⚠️  Unable to determine fzf version`);
      }

      yield* Effect.logInfo(`🚀 Starting fzf upgrade via mise...`);

      const updateSuccess = yield* fzfTools.performUpgrade();
      if (!updateSuccess) {
        yield* Effect.logError(`❌ Failed to update fzf to required version`);
        yield* Effect.logError(`💡 Try manually installing fzf via mise: mise install fzf@latest`);
        return yield* externalToolError("Failed to update fzf", {
          tool: "fzf",
          exitCode: 1,
          stderr: `Required version: ${FZF_MIN_VERSION}, Current: ${currentVersion}`,
        });
      }

      // Verify upgrade
      const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* fzfTools.checkVersion();
      if (!isValidAfterUpgrade) {
        yield* Effect.logError(`❌ Fzf upgrade completed but version still doesn't meet requirement`);
        if (versionAfterUpgrade) {
          yield* Effect.logError(`   Current: ${versionAfterUpgrade}, Required: ${FZF_MIN_VERSION}`);
        }
        return yield* externalToolError("Fzf upgrade failed", {
          tool: "fzf",
          exitCode: 1,
          stderr: `Required: ${FZF_MIN_VERSION}, Got: ${versionAfterUpgrade}`,
        });
      }

      if (versionAfterUpgrade) {
        yield* Effect.logInfo(`✨ Fzf successfully upgraded to version ${versionAfterUpgrade}`);
      }
    }),

  performHealthCheck: (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    Effect.gen(function* () {
      const fzfTools = makeFzfToolsLive(shell);
      const checkedAt = new Date(yield* Clock.currentTimeMillis);

      const currentVersion = yield* fzfTools
        .getCurrentVersion()
        .pipe(Effect.mapError(() => healthCheckError("Failed to get fzf version", "fzf")));

      if (!currentVersion) {
        return {
          toolName: "fzf",
          status: "fail",
          notes: "Fzf not found or unable to determine version",
          checkedAt,
        };
      }

      const isCompliant = compareVersions(currentVersion, FZF_MIN_VERSION) >= 0;
      if (!isCompliant) {
        return {
          toolName: "fzf",
          version: currentVersion,
          status: "warning",
          notes: `requires >=${FZF_MIN_VERSION}`,
          checkedAt,
        };
      }

      return {
        toolName: "fzf",
        version: currentVersion,
        status: "ok",
        checkedAt,
      };
    }),
});

// Service tag for Effect Context system
export class FzfToolsTag extends Context.Tag("FzfTools")<FzfToolsTag, FzfTools>() {}

// Effect Layer for dependency injection
export const FzfToolsLiveLayer = Layer.effect(
  FzfToolsTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeFzfToolsLive(shell);
  }),
);
