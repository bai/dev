import { Effect } from "effect";

import { ShellLiveLayer } from "~/capabilities/system/shell-live";
import { Shell } from "~/capabilities/system/shell-port";
import {
  buildMinimumVersionHealthCheck,
  checkVersionAgainstMinimum,
  ensureMinimumVersionOrUpgrade,
} from "~/capabilities/tools/adapters/versioned-tools-live";
import { type HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { Mise } from "~/capabilities/tools/mise-port";
import { type ExternalToolError, type HealthCheckError, type ShellExecutionError, type UnknownError } from "~/core/errors";
import { compareVersions } from "~/core/runtime/version-utils";

export const MISE_MIN_VERSION = "2026.1.5";

export interface MiseToolsService {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError | UnknownError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

export class MiseTools extends Effect.Service<MiseToolsService>()("MiseTools", {
  dependencies: [ShellLiveLayer],
  effect: Effect.gen(function* () {
    const shell = yield* Shell;
    const mise = yield* Mise;
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
            const match = output.match(/^(\d{4}\.\d{1,2}\.\d{1,2})/);
            return match && match[1] ? match[1] : null;
          }
          return null;
        }),
        Effect.orElseSucceed(() => null),
      );

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
        const versionInfo = yield* getVersionInfo();
        const requiredVersion = resolveRequiredVersion(versionInfo.latestVersion);
        return yield* checkVersionAgainstMinimum({
          minVersion: requiredVersion,
          getCurrentVersion: () => Effect.succeed(versionInfo.currentVersion),
        });
      });

    const performUpgrade = (): Effect.Effect<boolean, ShellExecutionError> =>
      Effect.gen(function* () {
        yield* Effect.logInfo("🔄 Updating mise to latest version...");

        const result = yield* shell.exec("mise", ["self-update"]);

        if (result.exitCode === 0) {
          yield* Effect.logInfo("✅ Mise updated successfully");
          return true;
        }

        yield* Effect.logError(`❌ Mise update failed with exit code: ${result.exitCode}`);
        if (result.stderr) {
          yield* Effect.logError(`   stderr: ${result.stderr}`);
        }
        return false;
      });

    return {
      getCurrentVersion,
      checkVersion,
      performUpgrade,
      ensureVersionOrUpgrade: (): Effect.Effect<void, ExternalToolError | ShellExecutionError | UnknownError> =>
        Effect.gen(function* () {
          const versionInfo = yield* getVersionInfo();
          const requiredVersion = resolveRequiredVersion(versionInfo.latestVersion);
          const isValid = versionInfo.currentVersion ? compareVersions(versionInfo.currentVersion, requiredVersion) >= 0 : false;

          if (isValid && versionInfo.currentVersion) {
            if (versionInfo.latestVersion) {
              yield* Effect.logInfo(`✅ Mise ${versionInfo.currentVersion} is the latest version`);
            } else {
              yield* Effect.logInfo(`✅ Mise ${versionInfo.currentVersion} meets required version >=${requiredVersion}`);
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
        }),
      performHealthCheck: () =>
        buildMinimumVersionHealthCheck({
          toolId: "mise",
          displayName: "Mise",
          minVersion: MISE_MIN_VERSION,
          getCurrentVersion,
          getBinaryPath,
        }),
    } satisfies MiseToolsService;
  }),
}) {}

export const MiseToolsLiveLayer = MiseTools.Default;
