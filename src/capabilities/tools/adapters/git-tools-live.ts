import { Effect } from "effect";

import { ShellLiveLayer } from "~/capabilities/system/shell-live";
import { Shell } from "~/capabilities/system/shell-port";
import { resolveActiveToolUpgradeStrategy } from "~/capabilities/tools/adapters/active-tool-upgrade-strategy";
import {
  buildMinimumVersionHealthCheck,
  checkVersionAgainstMinimum,
  ensureMinimumVersionOrUpgrade,
} from "~/capabilities/tools/adapters/versioned-tools-live";
import { type HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { type ExternalToolError, type HealthCheckError, type ShellExecutionError } from "~/core/errors";

export const GIT_MIN_VERSION = "2.52.0";

export interface GitToolsService {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

export class GitTools extends Effect.Service<GitToolsService>()("GitTools", {
  dependencies: [ShellLiveLayer],
  effect: Effect.gen(function* () {
    const shell = yield* Shell;
    const resolveUpgradeStrategy = () =>
      resolveActiveToolUpgradeStrategy(shell, {
        toolId: "git",
        brewFormula: "git",
        miseTool: "git",
      });
    const getBinaryPath = (): Effect.Effect<string | undefined, never> =>
      shell.exec("which", ["git"]).pipe(
        Effect.map((result) => (result.exitCode === 0 && result.stdout ? result.stdout.trim() : undefined)),
        Effect.orElseSucceed(() => undefined),
      );

    const getCurrentVersion = (): Effect.Effect<string | null, ShellExecutionError> =>
      shell.exec("git", ["--version"]).pipe(
        Effect.map((result) => {
          if (result.exitCode === 0 && result.stdout) {
            const output = result.stdout.trim();
            const match = output.match(/git version (\d+\.\d+\.\d+)/);
            return match && match[1] ? match[1] : null;
          }
          return null;
        }),
        Effect.orElseSucceed(() => null),
      );

    const performUpgrade = (): Effect.Effect<boolean, ShellExecutionError> =>
      Effect.gen(function* () {
        const upgradeStrategy = yield* resolveUpgradeStrategy();
        if (upgradeStrategy.binaryPath) {
          yield* Effect.logInfo(`   Active git binary: ${upgradeStrategy.binaryPath}`);
        }

        if (!upgradeStrategy.command || !upgradeStrategy.managerDisplayName) {
          yield* Effect.logError("❌ Unable to determine how to update git from the active PATH entry");
          return false;
        }

        yield* Effect.logInfo(`🔄 Updating git via ${upgradeStrategy.managerDisplayName}...`);

        const result = yield* shell.exec(upgradeStrategy.command, [...upgradeStrategy.args]);

        if (result.exitCode === 0) {
          yield* Effect.logInfo(`✅ Git updated successfully via ${upgradeStrategy.managerDisplayName}`);
          return true;
        }

        yield* Effect.logError(`❌ Git update failed with exit code: ${result.exitCode}`);
        if (result.stderr) {
          yield* Effect.logError(`   stderr: ${result.stderr}`);
        }
        return false;
      });

    return {
      getCurrentVersion,
      checkVersion: () => checkVersionAgainstMinimum({ minVersion: GIT_MIN_VERSION, getCurrentVersion }),
      performUpgrade,
      ensureVersionOrUpgrade: () =>
        ensureMinimumVersionOrUpgrade({
          toolId: "git",
          displayName: "Git",
          minVersion: GIT_MIN_VERSION,
          getCurrentVersion,
          performUpgrade,
          manualUpgradeHint: () => resolveUpgradeStrategy().pipe(Effect.map((upgradeStrategy) => upgradeStrategy.manualUpgradeHint)),
        }),
      performHealthCheck: () =>
        buildMinimumVersionHealthCheck({
          toolId: "git",
          displayName: "Git",
          minVersion: GIT_MIN_VERSION,
          getCurrentVersion,
          getBinaryPath,
        }),
    } satisfies GitToolsService;
  }),
}) {}

export const GitToolsLiveLayer = GitTools.Default;
