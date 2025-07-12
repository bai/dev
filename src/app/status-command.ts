import { Command } from "@effect/cli";
import { Effect } from "effect";

import { ConfigLoaderTag } from "../domain/config-loader-port";
import { statusCheckError } from "../domain/errors";
import { HealthCheckTag, type HealthCheckResult } from "../domain/health-check-port";
import type { EnvironmentInfo, GitInfo } from "../domain/models";
import { ShellTag } from "../domain/shell-port";

interface StatusItem {
  readonly tool: string;
  readonly version?: string;
  readonly status: "ok" | "warning" | "fail";
  readonly notes?: string;
}

// No options needed - always show comprehensive current status

// Create the status command using @effect/cli
export const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* () {
    yield* showEnvironmentInfo;

    const statusItems = yield* getHealthCheckResults;

    yield* displayHealthCheckResults(statusItems);

    yield* showSummary(statusItems);

    yield* checkForFailures(statusItems);
  }),
);

// Helper functions for better organization and testability

/**
 * Show environment information
 */
const showEnvironmentInfo: Effect.Effect<void, never, ShellTag> = Effect.gen(function* () {
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
const getEnvironmentInfo = (): Effect.Effect<EnvironmentInfo, never, ShellTag> =>
  Effect.gen(function* () {
    const currentDir = process.cwd();

    const gitInfo = yield* getGitInfo(currentDir);

    return {
      currentDirectory: currentDir,
      git: gitInfo,
    };
  });

/**
 * Get git information
 */
const getGitInfo = (cwd: string): Effect.Effect<GitInfo, never, ShellTag> =>
  Effect.gen(function* () {
    const branch = yield* getGitBranch(cwd);
    const remote = yield* getGitRemote(cwd);

    return {
      branch,
      remote,
    };
  });

/**
 * Get git branch information
 */
const getGitBranch = (cwd: string): Effect.Effect<string | null, never, ShellTag> =>
  executeCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd }).pipe(
    Effect.map((result) => (result.exitCode === 0 ? result.stdout.trim() : null)),
    Effect.catchAll(() => Effect.succeed(null)),
  );

/**
 * Get git remote information
 */
const getGitRemote = (cwd: string): Effect.Effect<string | null, never, ShellTag> =>
  executeCommand(["git", "remote", "get-url", "origin"], { cwd }).pipe(
    Effect.map((result) => (result.exitCode === 0 ? result.stdout.trim() : null)),
    Effect.catchAll(() => Effect.succeed(null)),
  );

/**
 * Execute a command and return structured result
 */
const executeCommand = (
  command: readonly string[],
  options: { readonly cwd?: string } = {},
): Effect.Effect<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }, never, ShellTag> =>
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    const [cmd, ...args] = command;

    if (!cmd) {
      return { exitCode: -1, stdout: "", stderr: "No command provided" } as const;
    }

    const result = yield* shell
      .exec(cmd, args, options)
      .pipe(Effect.catchAll(() => Effect.succeed({ exitCode: -1, stdout: "", stderr: "" } as const)));

    return result;
  });

/**
 * Get health check results and transform them
 */
const getHealthCheckResults: Effect.Effect<readonly StatusItem[], never, HealthCheckTag | ConfigLoaderTag> = Effect.gen(
  function* () {
    yield* Effect.logDebug("Running fresh health checks...");

    const healthCheckService = yield* HealthCheckTag;
    const configLoader = yield* ConfigLoaderTag;

    const config = yield* configLoader.load().pipe(Effect.catchAll(() => Effect.succeed(undefined)));

    // Run health checks directly and bypass cached results
    const results = yield* healthCheckService.runHealthChecks().pipe(
      Effect.catchAll(() => {
        return Effect.gen(function* () {
          yield* Effect.logError("Health check failed, using empty results");
          return [] as const;
        });
      }),
    );

    const statusItems = results.map(
      (result: HealthCheckResult): StatusItem => ({
        tool: result.toolName,
        version: result.version,
        status: result.status,
        notes: result.notes,
      }),
    );

    // Sort by tool name for consistent output
    return statusItems.sort((a, b) => a.tool.localeCompare(b.tool));
  },
);

/**
 * Display health check results
 */
const displayHealthCheckResults = (statusItems: readonly StatusItem[]): Effect.Effect<void, never, ShellTag> =>
  Effect.gen(function* () {
    if (statusItems.length > 0) {
      yield* displayToolGroup("🔧 Development Tools:", statusItems);
    }

    yield* Effect.logInfo("");
  });

/**
 * Display a group of tools
 */
const displayToolGroup = (title: string, items: readonly StatusItem[]): Effect.Effect<void, never, ShellTag> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(title);

    yield* Effect.forEach(items, displayToolItem, { concurrency: "unbounded" });

    yield* Effect.logInfo("");
  });

/**
 * Display a single tool item
 */
const displayToolItem = (item: StatusItem): Effect.Effect<void, never, ShellTag> =>
  Effect.gen(function* () {
    const icon = item.status === "ok" ? "✔" : item.status === "warning" ? "⚠" : "✗";
    const versionText = item.version ? ` ${item.version}` : "";
    const statusText = item.status === "warning" || item.status === "fail" ? ` (${item.status})` : "";

    const toolPath = yield* getToolPath(item.tool);
    const pathText = toolPath ? ` - ${toolPath}` : "";

    yield* Effect.logInfo(`  ${icon} ${item.tool}${versionText}${statusText}${pathText}`);

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
      yield* Effect.logWarning(`⚠️ ${warnCount} warnings, ${okCount} OK`);
    } else {
      yield* Effect.logInfo("All green. Have a great day! 🎉");
    }
  });

/**
 * Check for failures and exit with error if found
 */
const checkForFailures = (
  statusItems: readonly StatusItem[],
): Effect.Effect<void, ReturnType<typeof statusCheckError>, never> =>
  Effect.gen(function* () {
    const failedItems = statusItems.filter((item) => item.status === "fail");

    if (failedItems.length > 0) {
      const failedComponents = failedItems.map((item) => item.tool);
      const failCount = failedItems.length;
      const warnCount = statusItems.filter((item) => item.status === "warning").length;

      yield* Effect.fail(
        statusCheckError(`Found ${failCount} failing tool(s) and ${warnCount} warning(s)`, failedComponents),
      );
    }
  });

/**
 * Get tool path using mise which, falling back to system which
 */
const getToolPath = (toolName: string): Effect.Effect<string | null, never, ShellTag> =>
  Effect.gen(function* () {
    // Try mise which first
    const misePath = yield* executeCommand(["mise", "which", toolName]).pipe(
      Effect.map((result) => (result.exitCode === 0 ? result.stdout.trim() : null)),
    );

    // Return if mise found the tool
    if (misePath !== null) {
      return misePath;
    }

    // Fallback to system which
    const systemPath = yield* executeCommand(["which", toolName]).pipe(
      Effect.map((result) => (result.exitCode === 0 ? result.stdout.trim() : null)),
    );

    return systemPath;
  });
