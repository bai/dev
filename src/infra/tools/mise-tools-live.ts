import { Clock, Context, Effect, Layer } from "effect";

import {
  externalToolError,
  healthCheckError,
  type ExternalToolError,
  type HealthCheckError,
  type ShellExecutionError,
  type UnknownError,
} from "../../domain/errors";
import { type HealthCheckResult } from "../../domain/health-check-port";
import { MiseTag, type Mise } from "../../domain/mise-port";
import { ShellTag, type Shell } from "../../domain/shell-port";

export const MISE_MIN_VERSION = "2026.1.5";

/**
 * Mise tools for version checking and management.
 * Delegates global config setup to the Mise domain port.
 */
export interface MiseTools {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError | UnknownError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

// Factory function that creates MiseTools with dependencies
export const makeMiseToolsLive = (shell: Shell, mise: Mise): MiseTools => {
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
  const getCurrentVersion = (): Effect.Effect<string | null, ShellExecutionError> =>
    shell.exec("mise", ["--version"]).pipe(
      Effect.map((result) => {
        if (result.exitCode === 0 && result.stdout) {
          const output = result.stdout.trim();
          // Mise version output is like "2025.7.1 macos-arm64 (2025-07-06)"
          // Extract the version number at the start
          const match = output.match(/^(\d{4}\.\d{1,2}\.\d{1,2})/);
          return match && match[1] ? match[1] : null;
        }
        return null;
      }),
      Effect.orElseSucceed(() => null),
    );

  // Get version info including latest available version from mise version --json
  const getVersionInfo = (): Effect.Effect<{ currentVersion: string | null; latestVersion: string | null }, ShellExecutionError> =>
    shell.exec("mise", ["version", "--json"]).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0 || !result.stdout) {
          return Effect.succeed({ currentVersion: null, latestVersion: null });
        }

        return Effect.try(() => JSON.parse(result.stdout) as { version?: string; latest?: string }).pipe(
          Effect.map((json) => {
            const versionMatch = json.version?.match(/^(\d{4}\.\d{1,2}\.\d{1,2})/);
            return {
              currentVersion: versionMatch?.[1] ?? null,
              latestVersion: json.latest ?? null,
            };
          }),
          Effect.orElseSucceed(() => ({ currentVersion: null, latestVersion: null })),
        );
      }),
      Effect.orElseSucceed(() => ({ currentVersion: null, latestVersion: null })),
    );

  const checkVersion = (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError> =>
    getVersionInfo().pipe(
      Effect.map(({ currentVersion, latestVersion }) => {
        if (!currentVersion) {
          return { isValid: false, currentVersion: null };
        }

        // First check minimum version requirement
        const meetsMinimum = compareVersions(currentVersion, MISE_MIN_VERSION) >= 0;
        if (!meetsMinimum) {
          return { isValid: false, currentVersion };
        }

        // Then check if we have the latest version
        if (latestVersion) {
          const isLatest = compareVersions(currentVersion, latestVersion) >= 0;
          return { isValid: isLatest, currentVersion };
        }

        // If we can't determine latest, assume valid if >= minimum
        return { isValid: true, currentVersion };
      }),
    );

  const performUpgrade = (): Effect.Effect<boolean, ShellExecutionError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("🔄 Updating mise to latest version...");

      const result = yield* shell.exec("mise", ["self-update"]);

      if (result.exitCode === 0) {
        yield* Effect.logInfo("✅ Mise updated successfully");
        return true;
      } else {
        yield* Effect.logError(`❌ Mise update failed with exit code: ${result.exitCode}`);
        return false;
      }
    });

  const ensureVersionOrUpgrade = (): Effect.Effect<void, ExternalToolError | ShellExecutionError | UnknownError> =>
    Effect.gen(function* () {
      const { currentVersion, latestVersion } = yield* getVersionInfo();

      // Check if version is valid (meets minimum and is latest)
      const meetsMinimum = currentVersion ? compareVersions(currentVersion, MISE_MIN_VERSION) >= 0 : false;
      const isLatest = currentVersion && latestVersion ? compareVersions(currentVersion, latestVersion) >= 0 : false;
      const isValid = meetsMinimum && (isLatest || !latestVersion);

      // If version is already valid (latest), skip upgrade
      if (isValid && currentVersion) {
        yield* Effect.logInfo(`✅ Mise ${currentVersion} is the latest version`);
        yield* mise.setupGlobalConfig();
        return;
      }

      // Show appropriate warning based on why upgrade is needed
      if (!currentVersion) {
        yield* Effect.logWarning(`⚠️  Unable to determine mise version`);
      } else if (!meetsMinimum) {
        yield* Effect.logWarning(`⚠️  Mise ${currentVersion} is below minimum required version (>=${MISE_MIN_VERSION})`);
      } else if (latestVersion) {
        yield* Effect.logWarning(`⚠️  Mise ${currentVersion} is outdated (latest: ${latestVersion})`);
      } else {
        yield* Effect.logWarning(`⚠️  Mise ${currentVersion} may be outdated`);
      }

      yield* Effect.logInfo(`🚀 Starting mise upgrade...`);

      const updateSuccess = yield* performUpgrade();
      if (!updateSuccess) {
        yield* Effect.logError(`❌ Failed to update mise`);
        yield* Effect.logError(`💡 Try manually updating mise: mise self-update`);
        return yield* externalToolError("Failed to update mise", {
          tool: "mise",
          exitCode: 1,
          stderr: `Required: >=${MISE_MIN_VERSION}, Latest: ${latestVersion ?? "unknown"}, Current: ${currentVersion}`,
        });
      }

      yield* mise.setupGlobalConfig();

      // Re-check version after upgrade
      const { currentVersion: versionAfterUpgrade, latestVersion: latestAfterUpgrade } = yield* getVersionInfo();
      const meetsMinimumAfter = versionAfterUpgrade ? compareVersions(versionAfterUpgrade, MISE_MIN_VERSION) >= 0 : false;
      const isLatestAfter =
        versionAfterUpgrade && latestAfterUpgrade ? compareVersions(versionAfterUpgrade, latestAfterUpgrade) >= 0 : false;
      const isValidAfterUpgrade = meetsMinimumAfter && (isLatestAfter || !latestAfterUpgrade);

      if (!isValidAfterUpgrade) {
        yield* Effect.logError(`❌ Mise upgrade completed but not at latest version`);
        if (versionAfterUpgrade) {
          yield* Effect.logError(
            `   Current: ${versionAfterUpgrade}, Required: >=${MISE_MIN_VERSION}, Latest: ${latestAfterUpgrade ?? "unknown"}`,
          );
        }
        return yield* externalToolError("Mise upgrade failed", {
          tool: "mise",
          exitCode: 1,
          stderr: `Required: >=${MISE_MIN_VERSION}, Latest: ${latestAfterUpgrade ?? "unknown"}, Got: ${versionAfterUpgrade}`,
        });
      }

      if (versionAfterUpgrade) {
        yield* Effect.logInfo(`✨ Mise successfully upgraded to version ${versionAfterUpgrade}`);
      }
    });

  const performHealthCheck = (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    Effect.gen(function* () {
      const checkedAt = new Date(yield* Clock.currentTimeMillis);

      const currentVersion = yield* getCurrentVersion().pipe(Effect.mapError(() => healthCheckError("Failed to get mise version", "mise")));

      if (!currentVersion) {
        return {
          toolName: "mise",
          status: "fail",
          notes: "Mise not found or unable to determine version",
          checkedAt,
        };
      }

      const isCompliant = compareVersions(currentVersion, MISE_MIN_VERSION) >= 0;
      if (!isCompliant) {
        return {
          toolName: "mise",
          version: currentVersion,
          status: "warning",
          notes: `requires >=${MISE_MIN_VERSION}`,
          checkedAt,
        };
      }

      return {
        toolName: "mise",
        version: currentVersion,
        status: "ok",
        checkedAt,
      };
    });

  return {
    getCurrentVersion,
    checkVersion,
    performUpgrade,
    ensureVersionOrUpgrade,
    performHealthCheck,
  };
};

// Service tag for Effect Context system
export class MiseToolsTag extends Context.Tag("MiseTools")<MiseToolsTag, MiseTools>() {}

// Effect Layer for dependency injection using factory function
export const MiseToolsLiveLayer = Layer.effect(
  MiseToolsTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    const mise = yield* MiseTag;
    return makeMiseToolsLive(shell, mise);
  }),
);
