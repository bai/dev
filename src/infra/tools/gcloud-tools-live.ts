import path from "path";

import { Effect } from "effect";

import {
  unknownError,
  type ExternalToolError,
  type HealthCheckError,
  type ShellExecutionError,
  type UnknownError,
} from "../../domain/errors";
import { FileSystemTag, type FileSystem } from "../../domain/file-system-port";
import { type HealthCheckResult } from "../../domain/health-check-port";
import { PathServiceTag, type PathService } from "../../domain/path-service";
import { ShellTag, type Shell } from "../../domain/shell-port";
import { FileSystemLiveLayer } from "../file-system-live";
import { ShellLiveLayer } from "../shell-live";
import { buildMinimumVersionHealthCheck, checkVersionAgainstMinimum, ensureMinimumVersionOrUpgrade } from "./versioned-tools-live";

export const GCLOUD_MIN_VERSION = "552.0.0";

export interface GcloudTools {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError | UnknownError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
  setupConfig(): Effect.Effect<void, UnknownError>;
}

// Factory function that creates GcloudTools with dependencies
export const makeGcloudToolsLive = (shell: Shell, filesystem: FileSystem, pathService: PathService): GcloudTools => {
  const getBinaryPath = (): Effect.Effect<string | undefined, never> =>
    shell.exec("which", ["gcloud"]).pipe(
      Effect.map((result) => (result.exitCode === 0 && result.stdout ? result.stdout.trim() : undefined)),
      Effect.orElseSucceed(() => undefined),
    );

  const getCurrentVersion = (): Effect.Effect<string | null, ShellExecutionError> =>
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
      Effect.orElseSucceed(() => null),
    );

  const checkVersion = (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError> =>
    checkVersionAgainstMinimum({ minVersion: GCLOUD_MIN_VERSION, getCurrentVersion });

  const performUpgrade = (): Effect.Effect<boolean, ShellExecutionError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("🔄 Updating gcloud via mise...");

      const result = yield* shell.exec("mise", ["install", "gcloud@latest"]);

      if (result.exitCode === 0) {
        yield* Effect.logInfo("✅ Gcloud updated successfully via mise");
        return true;
      } else {
        yield* Effect.logError(`❌ Gcloud update failed with exit code: ${result.exitCode}`);
        if (result.stderr) {
          yield* Effect.logError(`   stderr: ${result.stderr}`);
        }
        return false;
      }
    });

  const setupConfig = (): Effect.Effect<void, UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("☁️  Setting up Google Cloud configuration...");

      const xdgConfigHome = path.dirname(pathService.configDir);
      const gcloudConfigDir = path.join(xdgConfigHome, "gcloud");

      // Create config directory if it doesn't exist
      const exists = yield* filesystem.exists(gcloudConfigDir);
      if (!exists) {
        yield* Effect.logInfo("   📂 Creating gcloud config directory...");
        yield* filesystem.mkdir(gcloudConfigDir, true).pipe(
          Effect.mapError((error) => {
            return unknownError(`Failed to create gcloud config directory: ${error}`);
          }),
        );
      }

      yield* Effect.logInfo("   ✅ Google Cloud config ready");
    });

  const ensureVersionOrUpgrade = (): Effect.Effect<void, ExternalToolError | ShellExecutionError | UnknownError> =>
    Effect.gen(function* () {
      const versionCheck = yield* checkVersion();
      if (versionCheck.isValid) {
        return;
      }

      yield* ensureMinimumVersionOrUpgrade({
        toolId: "gcloud",
        displayName: "Gcloud",
        minVersion: GCLOUD_MIN_VERSION,
        getCurrentVersion,
        performUpgrade,
        manualUpgradeHint: "Try manually installing gcloud via mise: mise install gcloud@latest",
      });

      yield* setupConfig();
    });

  const performHealthCheck = (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    buildMinimumVersionHealthCheck({
      toolId: "gcloud",
      displayName: "Gcloud",
      minVersion: GCLOUD_MIN_VERSION,
      getCurrentVersion,
      getBinaryPath,
    });

  return {
    getCurrentVersion,
    checkVersion,
    performUpgrade,
    ensureVersionOrUpgrade,
    setupConfig,
    performHealthCheck,
  };
};

export class GcloudToolsTag extends Effect.Service<GcloudTools>()("GcloudTools", {
  dependencies: [ShellLiveLayer, FileSystemLiveLayer],
  effect: Effect.gen(function* () {
    const shell = yield* ShellTag;
    const filesystem = yield* FileSystemTag;
    const pathService = yield* PathServiceTag;
    return makeGcloudToolsLive(shell, filesystem, pathService);
  }),
}) {}

export const GcloudToolsLiveLayer = GcloudToolsTag.Default;
