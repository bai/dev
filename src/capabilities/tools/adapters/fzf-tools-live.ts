import { Effect } from "effect";

import { ShellLiveLayer } from "~/capabilities/system/shell-live";
import { Shell } from "~/capabilities/system/shell-port";
import {
  buildMinimumVersionHealthCheck,
  checkVersionAgainstMinimum,
  ensureMinimumVersionOrUpgrade,
} from "~/capabilities/tools/adapters/versioned-tools-live";
import { type HealthCheckResult } from "~/capabilities/tools/health-check-port";
import { type ExternalToolError, type HealthCheckError, type ShellExecutionError } from "~/core/errors";

export const FZF_MIN_VERSION = "0.67.0";

export interface FzfToolsService {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

export class FzfTools extends Effect.Service<FzfToolsService>()("FzfTools", {
  dependencies: [ShellLiveLayer],
  effect: Effect.gen(function* () {
    const shell = yield* Shell;
    const getBinaryPath = (): Effect.Effect<string | undefined, never> =>
      shell.exec("which", ["fzf"]).pipe(
        Effect.map((result) => (result.exitCode === 0 && result.stdout ? result.stdout.trim() : undefined)),
        Effect.orElseSucceed(() => undefined),
      );

    const getCurrentVersion = (): Effect.Effect<string | null, ShellExecutionError> =>
      shell.exec("fzf", ["--version"]).pipe(
        Effect.map((result) => {
          if (result.exitCode === 0 && result.stdout) {
            const output = result.stdout.trim();
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
        }

        yield* Effect.logError(`❌ Fzf update failed with exit code: ${result.exitCode}`);
        if (result.stderr) {
          yield* Effect.logError(`   stderr: ${result.stderr}`);
        }
        return false;
      });

    return {
      getCurrentVersion,
      checkVersion: () => checkVersionAgainstMinimum({ minVersion: FZF_MIN_VERSION, getCurrentVersion }),
      performUpgrade,
      ensureVersionOrUpgrade: () =>
        ensureMinimumVersionOrUpgrade({
          toolId: "fzf",
          displayName: "Fzf",
          minVersion: FZF_MIN_VERSION,
          getCurrentVersion,
          performUpgrade,
          manualUpgradeHint: "Try manually installing fzf via mise: mise install fzf@latest",
        }),
      performHealthCheck: () =>
        buildMinimumVersionHealthCheck({
          toolId: "fzf",
          displayName: "Fzf",
          minVersion: FZF_MIN_VERSION,
          getCurrentVersion,
          getBinaryPath,
        }),
    } satisfies FzfToolsService;
  }),
}) {}

export const FzfToolsLiveLayer = FzfTools.Default;
