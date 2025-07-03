import { Context, Effect, Layer } from "effect";

import { externalToolError, type ExternalToolError, type UnknownError } from "../../domain/errors";
import { LoggerService, type Logger } from "../../domain/models";
import { DebugServiceTag, type DebugService } from "../../domain/ports/DebugService";
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

export class GitToolsLive implements GitToolsService {
  constructor(
    private shell: Shell,
    private logger: Logger,
    private debugService: DebugService,
  ) {}

  private compareVersions = (version1: string, version2: string): number => {
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

  getCurrentVersion(): Effect.Effect<string | null, UnknownError> {
    return this.shell.exec("git", ["--version"]).pipe(
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
    );
  }

  checkVersion(): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, UnknownError> {
    return this.getCurrentVersion().pipe(
      Effect.map((currentVersion) => {
        if (!currentVersion) {
          return { isValid: false, currentVersion: null };
        }

        const comparison = this.compareVersions(currentVersion, GIT_MIN_VERSION);
        const isDebug = this.debugService.isDebugMode;

        if (isDebug) {
          this.logger.debug(
            `Git version check: ${currentVersion} vs ${GIT_MIN_VERSION} (${comparison >= 0 ? "valid" : "invalid"})`,
          );
        }

        return {
          isValid: comparison >= 0,
          currentVersion,
        };
      }),
    );
  }

  performUpgrade(): Effect.Effect<boolean, UnknownError> {
    return Effect.gen(
      function* (this: GitToolsLive) {
        yield* this.logger.info("⏳ Updating git via mise...");

        const result = yield* this.shell.exec("mise", ["install", "git@latest"]);

        if (result.exitCode === 0) {
          yield* this.logger.success("✅ Git updated successfully via mise");
          return true;
        } else {
          yield* this.logger.error(`❌ Git update failed with exit code: ${result.exitCode}`);
          return false;
        }
      }.bind(this),
    );
  }

  ensureVersionOrUpgrade(): Effect.Effect<void, ExternalToolError | UnknownError> {
    return Effect.gen(
      function* (this: GitToolsLive) {
        const { isValid, currentVersion } = yield* this.checkVersion();

        if (isValid) {
          const isDebug = this.debugService.isDebugMode;
          if (isDebug && currentVersion) {
            this.logger.debug(`Git version ${currentVersion} meets minimum requirement ${GIT_MIN_VERSION}`);
          }
          return;
        }

        if (currentVersion) {
          yield* this.logger.warn(`⚠️  Git version ${currentVersion} is older than required ${GIT_MIN_VERSION}`);
        } else {
          yield* this.logger.warn(`⚠️  Unable to determine git version`);
        }

        yield* this.logger.info(`🚀 Starting git upgrade via mise...`);

        const updateSuccess = yield* this.performUpgrade();
        if (!updateSuccess) {
          yield* this.logger.error(`❌ Failed to update git to required version`);
          yield* this.logger.error(`💡 Try manually installing git via mise: mise install git@latest`);
          return yield* Effect.fail(
            externalToolError("Failed to update git", {
              tool: "git",
              exitCode: 1,
              stderr: `Required version: ${GIT_MIN_VERSION}, Current: ${currentVersion}`,
            }),
          );
        }

        // Verify upgrade
        const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* this.checkVersion();
        if (!isValidAfterUpgrade) {
          yield* this.logger.error(`❌ Git upgrade completed but version still doesn't meet requirement`);
          if (versionAfterUpgrade) {
            yield* this.logger.error(`   Current: ${versionAfterUpgrade}, Required: ${GIT_MIN_VERSION}`);
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
          yield* this.logger.success(`✨ Git successfully upgraded to version ${versionAfterUpgrade}`);
        }
      }.bind(this),
    );
  }
}

// Service tag for Effect Context system
export class GitToolsServiceTag extends Context.Tag("GitToolsService")<GitToolsServiceTag, GitToolsService>() {}

// Effect Layer for dependency injection
export const GitToolsLiveLayer = Layer.effect(
  GitToolsServiceTag,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    const logger = yield* LoggerService;
    const debugService = yield* DebugServiceTag;
    return new GitToolsLive(shell, logger, debugService);
  }),
);
