import { Context, Effect, Layer } from "effect";

import {
  type ExternalToolError,
  type HealthCheckError,
  type ShellExecutionError,
} from "../../domain/errors";
import { type HealthCheckResult } from "../../domain/health-check-port";
import { ShellTag, type Shell } from "../../domain/shell-port";
import { buildMinimumVersionHealthCheck, checkVersionAgainstMinimum, ensureMinimumVersionOrUpgrade } from "./versioned-tools-live";

export const FZF_MIN_VERSION = "0.67.0";

export interface FzfTools {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

// Factory function to create FzfTools implementation
export const makeFzfToolsLive = (shell: Shell): FzfTools => {
  const getCurrentVersion = (): Effect.Effect<string | null, ShellExecutionError> =>
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
    );

  const performUpgrade = (): Effect.Effect<boolean, ShellExecutionError> =>
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
    });

  const checkVersion = (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError> =>
    checkVersionAgainstMinimum({ minVersion: FZF_MIN_VERSION, getCurrentVersion });

  const ensureVersionOrUpgrade = (): Effect.Effect<void, ExternalToolError | ShellExecutionError> =>
    ensureMinimumVersionOrUpgrade({
      toolId: "fzf",
      displayName: "Fzf",
      minVersion: FZF_MIN_VERSION,
      getCurrentVersion,
      performUpgrade,
      manualUpgradeHint: "Try manually installing fzf via mise: mise install fzf@latest",
    });

  const performHealthCheck = (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    buildMinimumVersionHealthCheck({
      toolId: "fzf",
      displayName: "Fzf",
      minVersion: FZF_MIN_VERSION,
      getCurrentVersion,
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
export class FzfToolsTag extends Context.Tag("FzfTools")<FzfToolsTag, FzfTools>() {}

// Effect Layer for dependency injection
export const FzfToolsLiveLayer = Layer.effect(
  FzfToolsTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeFzfToolsLive(shell);
  }),
);
