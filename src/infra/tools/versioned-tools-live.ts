import { Clock, Effect } from "effect";

import {
  externalToolError,
  healthCheckError,
  type ExternalToolError,
  type HealthCheckError,
  type ShellExecutionError,
} from "../../domain/errors";
import { type HealthCheckResult } from "../../domain/health-check-port";
import { compareVersions } from "../../domain/version-utils";

interface VersionedToolContext {
  readonly toolId: string;
  readonly displayName: string;
  readonly minVersion: string;
  readonly getCurrentVersion: () => Effect.Effect<string | null, ShellExecutionError>;
  readonly getBinaryPath?: () => Effect.Effect<string | undefined, never>;
  readonly performUpgrade: () => Effect.Effect<boolean, ShellExecutionError>;
  readonly manualUpgradeHint?: string;
}

export const checkVersionAgainstMinimum = (
  context: Pick<VersionedToolContext, "minVersion" | "getCurrentVersion">,
): Effect.Effect<{ isValid: boolean; currentVersion: string | null }, ShellExecutionError> =>
  Effect.gen(function* () {
    const currentVersion = yield* context.getCurrentVersion();

    if (!currentVersion) {
      return { isValid: false, currentVersion: null };
    }

    return {
      isValid: compareVersions(currentVersion, context.minVersion) >= 0,
      currentVersion,
    };
  });

export const ensureMinimumVersionOrUpgrade = (
  context: VersionedToolContext,
): Effect.Effect<void, ExternalToolError | ShellExecutionError> =>
  Effect.gen(function* () {
    const versionCheck = yield* checkVersionAgainstMinimum(context);

    if (versionCheck.isValid) {
      return;
    }

    if (versionCheck.currentVersion) {
      yield* Effect.logWarning(
        `⚠️  ${context.displayName} version ${versionCheck.currentVersion} is older than required ${context.minVersion}`,
      );
    } else {
      yield* Effect.logWarning(`⚠️  Unable to determine ${context.toolId} version`);
    }

    yield* Effect.logInfo(`🚀 Starting ${context.toolId} upgrade...`);

    const updateSuccess = yield* context.performUpgrade();
    if (!updateSuccess) {
      yield* Effect.logError(`❌ Failed to update ${context.toolId} to required version`);
      if (context.manualUpgradeHint) {
        yield* Effect.logError(`💡 ${context.manualUpgradeHint}`);
      }
      return yield* externalToolError(`Failed to update ${context.toolId}`, {
        tool: context.toolId,
        exitCode: 1,
        stderr: `Required version: ${context.minVersion}, Current: ${versionCheck.currentVersion}`,
      });
    }

    const versionCheckAfterUpgrade = yield* checkVersionAgainstMinimum(context);
    if (!versionCheckAfterUpgrade.isValid) {
      yield* Effect.logError(`❌ ${context.displayName} upgrade completed but version still doesn't meet requirement`);
      if (versionCheckAfterUpgrade.currentVersion) {
        yield* Effect.logError(`   Current: ${versionCheckAfterUpgrade.currentVersion}, Required: ${context.minVersion}`);
      }
      return yield* externalToolError(`${context.displayName} upgrade failed`, {
        tool: context.toolId,
        exitCode: 1,
        stderr: `Required: ${context.minVersion}, Got: ${versionCheckAfterUpgrade.currentVersion}`,
      });
    }

    if (versionCheckAfterUpgrade.currentVersion) {
      yield* Effect.logInfo(`✨ ${context.displayName} successfully upgraded to version ${versionCheckAfterUpgrade.currentVersion}`);
    }
  });

export const buildMinimumVersionHealthCheck = (
  context: Pick<VersionedToolContext, "toolId" | "displayName" | "minVersion" | "getCurrentVersion" | "getBinaryPath">,
): Effect.Effect<HealthCheckResult, HealthCheckError> =>
  Effect.gen(function* () {
    const checkedAt = new Date(yield* Clock.currentTimeMillis);
    const binaryPath = context.getBinaryPath ? yield* context.getBinaryPath() : undefined;

    const currentVersion = yield* context
      .getCurrentVersion()
      .pipe(Effect.mapError(() => healthCheckError(`Failed to get ${context.toolId} version`, context.toolId)));

    if (!currentVersion) {
      return {
        toolName: context.toolId,
        binaryPath,
        status: "fail",
        notes: `${context.displayName} not found or unable to determine version`,
        checkedAt,
      };
    }

    const isCompliant = compareVersions(currentVersion, context.minVersion) >= 0;
    if (!isCompliant) {
      return {
        toolName: context.toolId,
        version: currentVersion,
        binaryPath,
        status: "warning",
        notes: `requires >=${context.minVersion}`,
        checkedAt,
      };
    }

    return {
      toolName: context.toolId,
      version: currentVersion,
      binaryPath,
      status: "ok",
      checkedAt,
    };
  });
