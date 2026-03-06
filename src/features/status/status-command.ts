import { Command } from "@effect/cli";
import { Effect } from "effect";

import { CommandRegistryTag } from "~/bootstrap/command-registry-port";
import { RunStoreTag } from "~/capabilities/persistence/run-store-port";
import { DockerServicesTag, type ServiceStatus } from "~/capabilities/services/docker-services-port";
import { GitTag } from "~/capabilities/system/git-port";
import { HealthCheckTag } from "~/capabilities/tools/health-check-port";
import { statusCheckError } from "~/core/errors";
import type { EnvironmentInfo, GitInfo } from "~/core/models";
import { RuntimeContextTag } from "~/core/runtime/runtime-context-port";

interface StatusItem {
  readonly tool: string;
  readonly version?: string;
  readonly binaryPath?: string;
  readonly status: "ok" | "warning" | "fail";
  readonly notes?: string;
}

// No options needed - always show comprehensive current status

/**
 * Display help for the status command
 */
export const displayHelp = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("Check the health and status of your development environment\n");

    yield* Effect.logInfo("USAGE");
    yield* Effect.logInfo("  dev status\n");

    yield* Effect.logInfo("EXAMPLES");
    yield* Effect.logInfo("  dev status                 # Show comprehensive environment status\n");
  });

// Create the status command using @effect/cli
export const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    yield* showEnvironmentInfo.pipe(Effect.withSpan("ui.show_environment"));

    const statusItems = yield* getHealthCheckResults.pipe(Effect.withSpan("health.get_check_results"));
    yield* Effect.annotateCurrentSpan("health.check.count", statusItems.length.toString());

    yield* displayHealthCheckResults(statusItems).pipe(Effect.withSpan("ui.display_health_results"));

    yield* showDockerServicesStatus.pipe(Effect.withSpan("ui.show_docker_services"));
    yield* showLastUpgradedStatus.pipe(Effect.withSpan("ui.show_last_upgraded"));

    yield* showSummary(statusItems).pipe(Effect.withSpan("ui.show_summary"));

    yield* checkForFailures(statusItems).pipe(Effect.withSpan("health.check_failures"));
  }).pipe(Effect.withSpan("status.execute")),
);

// Helper functions for better organization and testability

/**
 * Show environment information
 */
const showEnvironmentInfo: Effect.Effect<void, never, GitTag | RuntimeContextTag> = Effect.gen(function* () {
  yield* Effect.logInfo("🌍 Environment Information:");
  yield* Effect.logInfo("");

  const envInfo = yield* getEnvironmentInfo();
  yield* Effect.logInfo(`📁 Current Directory: ${envInfo.currentDirectory}`);

  if (envInfo.git.branch !== null) {
    yield* Effect.logInfo(`🌿 Git Branch: ${envInfo.git.branch}`);
  }

  if (envInfo.git.remote !== null) {
    yield* Effect.logInfo(`🔗 Git Remote: ${envInfo.git.remote}`);
  }

  yield* Effect.logInfo("");
  yield* Effect.logInfo("🔍 Health Check Results:");
  yield* Effect.logInfo("");
});

/**
 * Get comprehensive environment information
 */
const getEnvironmentInfo = (): Effect.Effect<EnvironmentInfo, never, GitTag | RuntimeContextTag> =>
  Effect.gen(function* () {
    const runtimeContext = yield* RuntimeContextTag;
    const currentDir = runtimeContext.getCwd();

    const gitInfo = yield* getGitInfo(currentDir);

    return {
      currentDirectory: currentDir,
      git: gitInfo,
    };
  });

/**
 * Get git information
 */
const getGitInfo = (cwd: string): Effect.Effect<GitInfo, never, GitTag> =>
  Effect.gen(function* () {
    const git = yield* GitTag;
    const branch = yield* git.getCurrentBranch(cwd).pipe(Effect.orElseSucceed(() => null));
    const remote = yield* git.getRemoteUrl(cwd, "origin").pipe(Effect.orElseSucceed(() => null));

    return {
      branch,
      remote,
    };
  });

/**
 * Get health check results and transform them
 */
const getHealthCheckResults: Effect.Effect<readonly StatusItem[], never, HealthCheckTag> = Effect.gen(function* () {
  yield* Effect.logDebug("Running fresh health checks...");

  const healthCheckService = yield* HealthCheckTag;

  // Run health checks directly and bypass cached results.
  // If execution itself fails, emit a synthetic failing item so summary/exit logic remains accurate.
  const statusItems = yield* healthCheckService.runHealthChecks().pipe(
    Effect.map((results) =>
      results.map(
        (result): StatusItem => ({
          tool: result.toolName,
          version: result.version,
          binaryPath: result.binaryPath,
          status: result.status,
          notes: result.notes,
        }),
      ),
    ),
    Effect.catchTag("HealthCheckError", (error) =>
      Effect.gen(function* () {
        const message = error.message.trim().length > 0 ? error.message : "Health check execution failed";
        yield* Effect.logError(`Health check failed: ${message}`);
        return [
          {
            tool: "health-check-runtime",
            status: "fail",
            notes: message,
          } satisfies StatusItem,
        ] as const;
      }),
    ),
  );

  // Sort by tool name for consistent output
  return [...statusItems].sort((a, b) => a.tool.localeCompare(b.tool));
});

/**
 * Display health check results
 */
const displayHealthCheckResults = (statusItems: readonly StatusItem[]): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    if (statusItems.length > 0) {
      yield* displayToolGroup("🔧 Development Tools:", statusItems);
    }

    yield* Effect.logInfo("");
  });

/**
 * Get connection string for a service
 */
const getServiceConnectionString = (status: ServiceStatus): string | undefined => {
  if (status.state !== "running" || !status.port) return undefined;

  switch (status.name) {
    case "postgres17":
    case "postgres18":
      return `postgresql://dev:dev@localhost:${status.port}/dev`;
    case "valkey":
      return `redis://localhost:${status.port}`;
    default:
      return undefined;
  }
};

/**
 * Show Docker services status
 */
const showDockerServicesStatus: Effect.Effect<void, never, DockerServicesTag> = Effect.gen(function* () {
  const dockerServices = yield* DockerServicesTag;

  const isAvailable = yield* dockerServices.isDockerAvailable();
  if (!isAvailable) {
    yield* Effect.logInfo("🐳 Docker Services: Docker not available");
    yield* Effect.logInfo("");
    return;
  }

  const statuses = yield* dockerServices.status().pipe(
    Effect.catchTags({
      DockerServiceError: (error) =>
        Effect.gen(function* () {
          yield* Effect.logWarning(`🐳 Docker Services: Unable to determine status: ${error.message}`);
          return null;
        }),
      ShellExecutionError: (error) =>
        Effect.gen(function* () {
          yield* Effect.logWarning(`🐳 Docker Services: Unable to determine status: ${error.message}`);
          return null;
        }),
    }),
  );

  if (statuses === null) {
    yield* Effect.logInfo("");
    return;
  }

  if (statuses.length === 0) {
    yield* Effect.logInfo("🐳 Docker Services: No services configured");
    yield* Effect.logInfo("");
    return;
  }

  yield* Effect.logInfo("🐳 Docker Services:");
  yield* Effect.logInfo("");

  for (const status of statuses) {
    const stateIcon = status.state === "running" ? "●" : "○";
    const healthDisplay =
      status.health === "healthy"
        ? " (healthy)"
        : status.health === "unhealthy"
          ? " (unhealthy)"
          : status.health === "starting"
            ? " (starting)"
            : "";
    const portDisplay = status.port ? `:${status.port}` : "";

    yield* Effect.logInfo(`  ${stateIcon} ${status.name}${portDisplay} - ${status.state}${healthDisplay}`);

    const connStr = getServiceConnectionString(status);
    if (connStr) {
      yield* Effect.logInfo(`    → ${connStr}`);
    }
  }

  yield* Effect.logInfo("");
});

const formatUpgradeTimestamp = (date: Date): string =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);

const getLastUpgradeTimestamp = (): Effect.Effect<Date | null, never, RunStoreTag> =>
  Effect.gen(function* () {
    const runStore = yield* RunStoreTag;
    const recentRuns = yield* runStore.getRecentRuns(100).pipe(Effect.orElseSucceed(() => []));
    const lastUpgradeRun = recentRuns.find((run) => run.commandName === "upgrade");
    return lastUpgradeRun ? lastUpgradeRun.startedAt : null;
  });

const showLastUpgradedStatus: Effect.Effect<void, never, RunStoreTag> = Effect.gen(function* () {
  const lastUpgradeTimestamp = yield* getLastUpgradeTimestamp();

  if (lastUpgradeTimestamp === null) {
    yield* Effect.logInfo("⬆️ Last Upgraded: Never");
    yield* Effect.logInfo("");
    return;
  }

  yield* Effect.logInfo(`⬆️ Last Upgraded: ${formatUpgradeTimestamp(lastUpgradeTimestamp)}`);
  yield* Effect.logInfo("");
});

/**
 * Display a group of tools
 */
const displayToolGroup = (title: string, items: readonly StatusItem[]): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(title);

    yield* Effect.forEach(items, displayToolItem, { concurrency: "unbounded" });

    yield* Effect.logInfo("");
  });

/**
 * Display a single tool item
 */
const displayToolItem = (item: StatusItem): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    const icon = item.status === "ok" ? "✅" : item.status === "warning" ? "⚠️ " : "❌";
    const versionText = item.version ? ` ${item.version}` : "";
    const pathText = item.binaryPath ? ` - ${item.binaryPath}` : "";

    yield* Effect.logInfo(`  ${icon} ${item.tool}${versionText}${pathText}`);

    if (item.notes && (item.status === "warning" || item.status === "fail")) {
      yield* Effect.logInfo(`     Note: ${item.notes}`);
    }
  });

/**
 * Show summary of health check results
 */
const showSummary = (statusItems: readonly StatusItem[]): Effect.Effect<void, never> =>
  Effect.gen(function* () {
    const okCount = statusItems.filter((item) => item.status === "ok").length;
    const warnCount = statusItems.filter((item) => item.status === "warning").length;
    const failCount = statusItems.filter((item) => item.status === "fail").length;

    if (failCount > 0) {
      yield* Effect.logError(`❌ ${failCount} failing, ${warnCount} warnings, ${okCount} OK`);
    } else if (warnCount > 0) {
      yield* Effect.logWarning(`⚠️  ${warnCount} warnings, ${okCount} OK`);
    } else {
      yield* Effect.logInfo("All green. Have a great day! 🎉");
    }
  });

/**
 * Check for failures and exit with error if found
 */
const checkForFailures = (statusItems: readonly StatusItem[]): Effect.Effect<void, ReturnType<typeof statusCheckError>, never> =>
  Effect.gen(function* () {
    const failedItems = statusItems.filter((item) => item.status === "fail");

    if (failedItems.length > 0) {
      const failedComponents = failedItems.map((item) => item.tool);
      const failCount = failedItems.length;
      const warnCount = statusItems.filter((item) => item.status === "warning").length;

      yield* statusCheckError(`Found ${failCount} failing tool(s) and ${warnCount} warning(s)`, failedComponents);
    }
  });

/**
 * Register the status command with the command registry
 */
export const registerStatusCommand: Effect.Effect<void, never, CommandRegistryTag> = Effect.gen(function* () {
  const registry = yield* CommandRegistryTag;
  yield* registry.register({
    name: "status",
    command: statusCommand,
    displayHelp,
  });
});
