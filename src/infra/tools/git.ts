import { Context, Effect, Layer } from "effect";

import { externalToolError, type ExternalToolError, type UnknownError } from "../../domain/errors";
import { ShellService, type Shell } from "../../domain/ports/Shell";

export const GIT_MIN_VERSION = "2.50.0";

/**
 * Git tools service for version checking and management
 * This is infrastructure-level tooling for git version management
 */
export interface GitToolsService {
  getCurrentVersion(): Effect.Effect<string | null, UnknownError>;
  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError>;
  performUpgrade(): Effect.Effect<boolean, UnknownError>;
  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | UnknownError>;
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

// Factory function to create GitToolsService implementation
export const makeGitToolsLive = (shell: Shell): GitToolsService => ({
  getCurrentVersion: (): Effect.Effect<string | null, UnknownError> =>
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

  checkVersion: (): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError> =>
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

  performUpgrade: (): Effect.Effect<boolean, UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("⏳ Updating git via mise...");

      const result = yield* shell.exec("mise", ["install", "git@latest"]);

      if (result.exitCode === 0) {
        yield* Effect.logInfo("✅ Git updated successfully via mise");
        return true;
      } else {
        yield* Effect.logInfo(`❌ Git update failed with exit code: ${result.exitCode}`);
        return false;
      }
    }),

  ensureVersionOrUpgrade: (): Effect.Effect<void, ExternalToolError | UnknownError> =>
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
});

// Service tag for Effect Context system
export class GitToolsServiceTag extends Context.Tag("GitToolsService")<GitToolsServiceTag, GitToolsService>() {}

// Effect Layer for dependency injection
export const GitToolsLiveLayer = Layer.effect(
  GitToolsServiceTag,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    return makeGitToolsLive(shell);
  }),
);
