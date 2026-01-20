import { Clock, Context, Effect, Layer } from "effect";

import {
  externalToolError,
  healthCheckError,
  type ExternalToolError,
  type HealthCheckError,
  type ShellExecutionError,
} from "../domain/errors";
import { type HealthCheckResult } from "../domain/health-check-port";
import { ShellTag, type Shell } from "../domain/shell-port";

export const GIT_MIN_VERSION = "2.52.0";

/**
 * Git tools for version checking and management
 * This is infrastructure-level tooling for git version management
 */
export interface GitTools {
  getCurrentVersion(): Effect.Effect<string | null, ShellExecutionError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError>;
  performUpgrade(): Effect.Effect<boolean, ShellExecutionError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | ShellExecutionError>;
  performHealthCheck(): Effect.Effect<HealthCheckResult, HealthCheckError>;
}

// Helper function for version comparison
const compareVersions = (version1: string, version2: string): number => {
  const v1Parts = version1.split(".").map(Number);
  const v2Parts = version2.split(".").map(Number);

  const maxLength = Math.max(v1Parts.length, v2Parts.length);
  while (v1Parts.length < maxLength) v1Parts.push(0);
  while (v2Parts.length < maxLength) v2Parts.push(0);

  for (let i = 0; i < maxLength; i++) {
    const v1Part = v1Parts[i] ?? 0;
    const v2Part = v2Parts[i] ?? 0;

    if (v1Part < v2Part) return -1;
    if (v1Part > v2Part) return 1;
  }

  return 0;
};

// Factory function to create GitTools implementation
export const makeGitToolsLive = (shell: Shell): GitTools => ({
  getCurrentVersion: (): Effect.Effect<string | null, ShellExecutionError> =>
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
      Effect.catchAll(() => Effect.succeed(null)),
    ),

  checkVersion: (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError> =>
    Effect.gen(function* () {
      const gitTools = makeGitToolsLive(shell);
      const currentVersion = yield* gitTools.getCurrentVersion();

      if (!currentVersion) {
        return { isValid: false, currentVersion: null };
      }

      const comparison = compareVersions(currentVersion, GIT_MIN_VERSION);

      return {
        isValid: comparison >= 0,
        currentVersion,
      };
    }),

  performUpgrade: (): Effect.Effect<boolean, ShellExecutionError> =>
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
    }),

  ensureVersionOrUpgrade: (): Effect.Effect<void, ExternalToolError | ShellExecutionError> =>
    Effect.gen(function* () {
      const gitTools = makeGitToolsLive(shell);
      const { isValid, currentVersion } = yield* gitTools.checkVersion();

      if (isValid) {
        return;
      }

      if (currentVersion) {
        yield* Effect.logWarning(`⚠️  Git version ${currentVersion} is older than required ${GIT_MIN_VERSION}`);
      } else {
        yield* Effect.logWarning(`⚠️  Unable to determine git version`);
      }

      yield* Effect.logInfo(`🚀 Starting git upgrade via mise...`);

      const updateSuccess = yield* gitTools.performUpgrade();
      if (!updateSuccess) {
        yield* Effect.logInfo(`❌ Failed to update git to required version`);
        yield* Effect.logInfo(`💡 Try manually installing git via mise: mise install git@latest`);
        return yield* Effect.fail(
          externalToolError("Failed to update git", {
            tool: "git",
            exitCode: 1,
            stderr: `Required version: ${GIT_MIN_VERSION}, Current: ${currentVersion}`,
          }),
        );
      }

      // Verify upgrade
      const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* gitTools.checkVersion();
      if (!isValidAfterUpgrade) {
        yield* Effect.logInfo(`❌ Git upgrade completed but version still doesn't meet requirement`);
        if (versionAfterUpgrade) {
          yield* Effect.logInfo(`   Current: ${versionAfterUpgrade}, Required: ${GIT_MIN_VERSION}`);
        }
        return yield* Effect.fail(
          externalToolError("Git upgrade failed", {
            tool: "git",
            exitCode: 1,
            stderr: `Required: ${GIT_MIN_VERSION}, Got: ${versionAfterUpgrade}`,
          }),
        );
      }

      if (versionAfterUpgrade) {
        yield* Effect.logInfo(`✨ Git successfully upgraded to version ${versionAfterUpgrade}`);
      }
    }),

  performHealthCheck: (): Effect.Effect<HealthCheckResult, HealthCheckError> =>
    Effect.gen(function* () {
      const gitTools = makeGitToolsLive(shell);
      const checkedAt = new Date(yield* Clock.currentTimeMillis);

      const currentVersion = yield* gitTools
        .getCurrentVersion()
        .pipe(Effect.mapError(() => healthCheckError("Failed to get git version", "git")));

      if (!currentVersion) {
        return {
          toolName: "git",
          status: "fail",
          notes: "Git not found or unable to determine version",
          checkedAt,
        };
      }

      const isCompliant = compareVersions(currentVersion, GIT_MIN_VERSION) >= 0;
      if (!isCompliant) {
        return {
          toolName: "git",
          version: currentVersion,
          status: "warning",
          notes: `requires >=${GIT_MIN_VERSION}`,
          checkedAt,
        };
      }

      return {
        toolName: "git",
        version: currentVersion,
        status: "ok",
        checkedAt,
      };
    }),
});

// Service tag for Effect Context system
export class GitToolsTag extends Context.Tag("GitTools")<GitToolsTag, GitTools>() {}

// Effect Layer for dependency injection
export const GitToolsLiveLayer = Layer.effect(
  GitToolsTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeGitToolsLive(shell);
  }),
);
