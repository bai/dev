import { Effect } from "effect";

import { type ExternalToolError, type HealthCheckError, type ShellExecutionError } from "../../domain/errors";
import { type HealthCheckResult } from "../../domain/health-check-port";
import { ShellTag, type Shell } from "../../domain/shell-port";
import { ShellLiveLayer } from "../shell-live";
import { buildMinimumVersionHealthCheck, checkVersionAgainstMinimum, ensureMinimumVersionOrUpgrade } from "./versioned-tools-live";

export const BUN_MIN_VERSION = "1.3.6";

export interface BunTools {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

// Factory function to create BunTools implementation
export const makeBunToolsLive = (shell: Shell): BunTools => {
  const getBinaryPath = (): Effect.Effect<string | undefined, never> =>
    shell.exec("which", ["bun"]).pipe(
      Effect.map((result) => (result.exitCode === 0 && result.stdout ? result.stdout.trim() : undefined)),
      Effect.orElseSucceed(() => undefined),
    );

  const getCurrentVersion = (): Effect.Effect<string | null, ShellExecutionError> =>
    shell.exec("bun", ["--version"]).pipe(
      Effect.map((result) => {
        if (result.exitCode === 0 && result.stdout) {
          const output = result.stdout.trim();
          // Bun version output is like "1.2.18"
          const match = output.match(/(\d+\.\d+\.\d+)/);
          return match && match[1] ? match[1] : null;
        }
        return null;
      }),
      Effect.orElseSucceed(() => null),
    );

  const performUpgrade = (): Effect.Effect<boolean, ShellExecutionError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("🔄 Updating bun...");

      const result = yield* shell.exec("bun", ["upgrade"]);

      if (result.exitCode === 0) {
        yield* Effect.logInfo("✅ Bun updated successfully");
        return true;
      } else {
        yield* Effect.logError(`❌ Bun update failed with exit code: ${result.exitCode}`);
        if (result.stderr) {
          yield* Effect.logError(`   stderr: ${result.stderr}`);
        }
        return false;
      }
    });

  const checkVersion = (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError> =>
    checkVersionAgainstMinimum({ minVersion: BUN_MIN_VERSION, getCurrentVersion });

  const ensureVersionOrUpgrade = (): Effect.Effect<void, ExternalToolError | ShellExecutionError> =>
    ensureMinimumVersionOrUpgrade({
      toolId: "bun",
      displayName: "Bun",
      minVersion: BUN_MIN_VERSION,
      getCurrentVersion,
      performUpgrade,
    });

  const performHealthCheck = (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    buildMinimumVersionHealthCheck({
      toolId: "bun",
      displayName: "Bun",
      minVersion: BUN_MIN_VERSION,
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

export class BunToolsTag extends Effect.Service<BunTools>()("BunTools", {
  dependencies: [ShellLiveLayer],
  effect: Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeBunToolsLive(shell);
  }),
}) {}

export const BunToolsLiveLayer = BunToolsTag.Default;
