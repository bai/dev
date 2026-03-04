import { Context, Effect, Layer } from "effect";

import { type ExternalToolError, type HealthCheckError, type ShellExecutionError, type UnknownError } from "../../domain/errors";
import { type HealthCheckResult } from "../../domain/health-check-port";
import { MiseTag, type Mise } from "../../domain/mise-port";
import { ShellTag, type Shell } from "../../domain/shell-port";
import { compareVersions } from "../../domain/version-utils";
import { buildMinimumVersionHealthCheck, checkVersionAgainstMinimum, ensureMinimumVersionOrUpgrade } from "./versioned-tools-live";

export const MISE_MIN_VERSION = "2026.1.5";

export interface MiseTools {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError | UnknownError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

// Factory function that creates MiseTools with dependencies
export const makeMiseToolsLive = (shell: Shell, mise: Mise): MiseTools => {
  const resolveRequiredVersion = (latestVersion: string | null): string =>
    latestVersion && compareVersions(latestVersion, MISE_MIN_VERSION) >= 0 ? latestVersion : MISE_MIN_VERSION;

  const getBinaryPath = (): Effect.Effect<string | undefined, never> =>
    shell.exec("which", ["mise"]).pipe(
      Effect.map((result) => (result.exitCode === 0 && result.stdout ? result.stdout.trim() : undefined)),
      Effect.orElseSucceed(() => undefined),
    );

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
    Effect.gen(function* () {
      const { currentVersion, latestVersion } = yield* getVersionInfo();
      const requiredVersion = resolveRequiredVersion(latestVersion);
      return yield* checkVersionAgainstMinimum({
        minVersion: requiredVersion,
        getCurrentVersion: () => Effect.succeed(currentVersion),
      });
    });

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
      const requiredVersion = resolveRequiredVersion(latestVersion);
      const isValid = currentVersion ? compareVersions(currentVersion, requiredVersion) >= 0 : false;

      if (isValid && currentVersion) {
        if (latestVersion) {
          yield* Effect.logInfo(`✅ Mise ${currentVersion} is the latest version`);
        } else {
          yield* Effect.logInfo(`✅ Mise ${currentVersion} meets required version >=${requiredVersion}`);
        }
        yield* mise.setupGlobalConfig();
        return;
      }

      yield* ensureMinimumVersionOrUpgrade({
        toolId: "mise",
        displayName: "Mise",
        minVersion: requiredVersion,
        getCurrentVersion,
        performUpgrade,
        manualUpgradeHint: "Try manually updating mise: mise self-update",
      });

      yield* mise.setupGlobalConfig();
    });

  const performHealthCheck = (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    buildMinimumVersionHealthCheck({
      toolId: "mise",
      displayName: "Mise",
      minVersion: MISE_MIN_VERSION,
      getCurrentVersion,
      getBinaryPath,
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
