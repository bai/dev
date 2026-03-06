import { Effect } from "effect";

import { type ExternalToolError, type HealthCheckError, type ShellExecutionError } from "../../domain/errors";
import { type HealthCheckResult } from "../../domain/health-check-port";
import { ShellTag, type Shell } from "../../domain/shell-port";
import { buildMinimumVersionHealthCheck, checkVersionAgainstMinimum, ensureMinimumVersionOrUpgrade } from "./versioned-tools-live";

export const GIT_MIN_VERSION = "2.52.0";

export interface GitTools {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

// Factory function to create GitTools implementation
export const makeGitToolsLive = (shell: Shell): GitTools => {
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
          // Git version output is like "git version 2.39.2"
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
      } else {
        yield* Effect.logInfo(`❌ Git update failed with exit code: ${result.exitCode}`);
        return false;
      }
    });

  const checkVersion = (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError> =>
    checkVersionAgainstMinimum({ minVersion: GIT_MIN_VERSION, getCurrentVersion });

  const ensureVersionOrUpgrade = (): Effect.Effect<void, ExternalToolError | ShellExecutionError> =>
    ensureMinimumVersionOrUpgrade({
      toolId: "git",
      displayName: "Git",
      minVersion: GIT_MIN_VERSION,
      getCurrentVersion,
      performUpgrade,
      manualUpgradeHint: "Try manually installing git via mise: mise install git@latest",
    });

  const performHealthCheck = (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    buildMinimumVersionHealthCheck({
      toolId: "git",
      displayName: "Git",
      minVersion: GIT_MIN_VERSION,
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

export class GitToolsTag extends Effect.Service<GitTools>()("GitTools", {
  effect: Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeGitToolsLive(shell);
  }),
}) {}

export const GitToolsLiveLayer = GitToolsTag.Default;
