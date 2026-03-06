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

export const BUN_MIN_VERSION = "1.3.6";

export interface BunTools {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

export class BunToolsTag extends Effect.Service<BunTools>()("BunTools", {
  dependencies: [ShellLiveLayer],
  effect: Effect.gen(function* () {
    const shell = yield* ShellTag;
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
        }

        yield* Effect.logError(`❌ Bun update failed with exit code: ${result.exitCode}`);
        if (result.stderr) {
          yield* Effect.logError(`   stderr: ${result.stderr}`);
        }
        return false;
      });

    return {
      getCurrentVersion,
      checkVersion: () => checkVersionAgainstMinimum({ minVersion: BUN_MIN_VERSION, getCurrentVersion }),
      performUpgrade,
      ensureVersionOrUpgrade: () =>
        ensureMinimumVersionOrUpgrade({
          toolId: "bun",
          displayName: "Bun",
          minVersion: BUN_MIN_VERSION,
          getCurrentVersion,
          performUpgrade,
        }),
      performHealthCheck: () =>
        buildMinimumVersionHealthCheck({
          toolId: "bun",
          displayName: "Bun",
          minVersion: BUN_MIN_VERSION,
          getCurrentVersion,
          getBinaryPath,
        }),
    } satisfies BunTools;
  }),
}) {}

export const BunToolsLiveLayer = BunToolsTag.Default;
