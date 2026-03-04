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
    const { isValid, currentVersion } = yield* checkVersionAgainstMinimum(context);

    if (isValid) {
      return;
    }

    if (currentVersion) {
      yield* Effect.logWarning(`⚠️  ${context.displayName} version ${currentVersion} is older than required ${context.minVersion}`);
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
        stderr: `Required version: ${context.minVersion}, Current: ${currentVersion}`,
      });
    }

    const { isValid: isValidAfterUpgrade, currentVersion: versionAfterUpgrade } = yield* checkVersionAgainstMinimum(context);
    if (!isValidAfterUpgrade) {
      yield* Effect.logError(`❌ ${context.displayName} upgrade completed but version still doesn't meet requirement`);
      if (versionAfterUpgrade) {
        yield* Effect.logError(`   Current: ${versionAfterUpgrade}, Required: ${context.minVersion}`);
      }
      return yield* externalToolError(`${context.displayName} upgrade failed`, {
        tool: context.toolId,
        exitCode: 1,
        stderr: `Required: ${context.minVersion}, Got: ${versionAfterUpgrade}`,
      });
    }

    if (versionAfterUpgrade) {
      yield* Effect.logInfo(`✨ ${context.displayName} successfully upgraded to version ${versionAfterUpgrade}`);
    }
  });

export const buildMinimumVersionHealthCheck = (
  context: Pick<VersionedToolContext, "toolId" | "displayName" | "minVersion" | "getCurrentVersion">,
): Effect.Effect<HealthCheckResult, HealthCheckError> =>
  Effect.gen(function* () {
    const checkedAt = new Date(yield* Clock.currentTimeMillis);

    const currentVersion = yield* context
      .getCurrentVersion()
      .pipe(Effect.mapError(() => healthCheckError(`Failed to get ${context.toolId} version`, context.toolId)));

    if (!currentVersion) {
      return {
        toolName: context.toolId,
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
        status: "warning",
        notes: `requires >=${context.minVersion}`,
        checkedAt,
      };
    }

    return {
      toolName: context.toolId,
      version: currentVersion,
      status: "ok",
      checkedAt,
    };
  });
