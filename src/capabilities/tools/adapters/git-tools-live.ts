import { Effect } from "effect";

import { ShellLiveLayer } from "~/capabilities/system/shell-live";
import { ShellTag } from "~/capabilities/system/shell-port";
import {
  buildMinimumVersionHealthCheck,
  checkVersionAgainstMinimum,
  ensureMinimumVersionOrUpgrade,
} from "~/capabilities/tools/adapters/versioned-tools-live";
import { type HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { type ExternalToolError, type HealthCheckError, type ShellExecutionError } from "~/core/errors";

export const GIT_MIN_VERSION = "2.52.0";

export interface GitTools {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

export class GitToolsTag extends Effect.Service<GitTools>()("GitTools", {
  dependencies: [ShellLiveLayer],
  effect: Effect.gen(function* () {
    const shell = yield* ShellTag;
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
        yield* Effect.logInfo("🔄 Updating git via mise...");

        const result = yield* shell.exec("mise", ["install", "git@latest"]);

        if (result.exitCode === 0) {
          yield* Effect.logInfo("✅ Git updated successfully via mise");
          return true;
        }

        yield* Effect.logInfo(`❌ Git update failed with exit code: ${result.exitCode}`);
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
          manualUpgradeHint: "Try manually installing git via mise: mise install git@latest",
        }),
      performHealthCheck: () =>
        buildMinimumVersionHealthCheck({
          toolId: "git",
          displayName: "Git",
          minVersion: GIT_MIN_VERSION,
          getCurrentVersion,
          getBinaryPath,
        }),
    } satisfies GitTools;
  }),
}) {}

export const GitToolsLiveLayer = GitToolsTag.Default;
