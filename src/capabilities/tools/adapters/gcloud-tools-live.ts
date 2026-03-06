import path from "path";

import { Effect } from "effect";

import { FileSystemLiveLayer } from "~/capabilities/system/file-system-live";
import { FileSystem } from "~/capabilities/system/file-system-port";
import { ShellLiveLayer } from "~/capabilities/system/shell-live";
import { Shell } from "~/capabilities/system/shell-port";
import {
  buildMinimumVersionHealthCheck,
  checkVersionAgainstMinimum,
  ensureMinimumVersionOrUpgrade,
} from "~/capabilities/tools/adapters/versioned-tools-live";
import { type HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { type ExternalToolError, type HealthCheckError, type ShellExecutionError, UnknownError } from "~/core/errors";
import { EnvironmentPaths } from "~/core/runtime/path-service";

export const GCLOUD_MIN_VERSION = "552.0.0";

export interface GcloudToolsService {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError | UnknownError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
  setupConfig(): Effect.Effect<void, UnknownError>;
}

export class GcloudTools extends Effect.Service<GcloudToolsService>()("GcloudTools", {
  dependencies: [ShellLiveLayer, FileSystemLiveLayer],
  effect: Effect.gen(function* () {
    const shell = yield* Shell;
    const filesystem = yield* FileSystem;
    const environmentPaths = yield* EnvironmentPaths;
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
            const match = output.match(/Google Cloud SDK (\d+\.\d+\.\d+)/);
            if (match && match[1]) {
              return match[1];
            }
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
        }

        yield* Effect.logError(`❌ Gcloud update failed with exit code: ${result.exitCode}`);
        if (result.stderr) {
          yield* Effect.logError(`   stderr: ${result.stderr}`);
        }
        return false;
      });

    const setupConfig = (): Effect.Effect<void, UnknownError> =>
      Effect.gen(function* () {
        yield* Effect.logInfo("☁️  Setting up Google Cloud configuration...");

        const xdgConfigHome = environmentPaths.xdgConfigHome;
        const gcloudConfigDir = path.join(xdgConfigHome, "gcloud");

        const exists = yield* filesystem.exists(gcloudConfigDir);
        if (!exists) {
          yield* Effect.logInfo("   📂 Creating gcloud config directory...");
          yield* filesystem.mkdir(gcloudConfigDir, true).pipe(
            Effect.mapError(
              (error) =>
                new UnknownError({
                  message: `Failed to create gcloud config directory: ${error}`,
                  details: `Failed to create gcloud config directory: ${error}`,
                }),
            ),
          );
        }

        yield* Effect.logInfo("   ✅ Google Cloud config ready");
      });

    return {
      getCurrentVersion,
      checkVersion,
      performUpgrade,
      ensureVersionOrUpgrade: (): Effect.Effect<void, ExternalToolError | ShellExecutionError | UnknownError> =>
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
        }),
      setupConfig,
      performHealthCheck: () =>
        buildMinimumVersionHealthCheck({
          toolId: "gcloud",
          displayName: "Gcloud",
          minVersion: GCLOUD_MIN_VERSION,
          getCurrentVersion,
          getBinaryPath,
        }),
    } satisfies GcloudToolsService;
  }),
}) {}

export const GcloudToolsLiveLayer = GcloudTools.Default;
