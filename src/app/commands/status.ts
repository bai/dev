import { Command, Options } from "@effect/cli";
import { Effect } from "effect";

import { ConfigLoaderService } from "../../config/loader";
import { exitCode, statusCheckError, unknownError, type DevError } from "../../domain/errors";
import { HealthCheckServiceTag } from "../../domain/ports/HealthCheckService";
import { PathServiceTag } from "../../domain/services/PathService";

interface StatusItem {
  tool: string;
  version?: string;
  status: "ok" | "warn" | "fail";
  message: string;
  checkedAt?: Date;
}

// Define options for the status command
const json = Options.boolean("json").pipe(Options.optional);
const refresh = Options.boolean("refresh").pipe(Options.optional);

// Create the status command using @effect/cli
export const statusCommand = Command.make("status", { json, refresh }, ({ json, refresh }) =>
  Effect.gen(function* () {
    const healthCheckService = yield* HealthCheckServiceTag;
    const configLoader = yield* ConfigLoaderService;
    const pathService = yield* PathServiceTag;

    const jsonOutput = json._tag === "Some" ? json.value : false;
    const forceRefresh = refresh._tag === "Some" ? refresh.value : false;

    let statusItems: StatusItem[] = [];

    try {
      if (forceRefresh) {
        yield* Effect.logDebug("Forcing fresh health check...");
        // Run health checks immediately and get results
        const results = yield* healthCheckService.runHealthChecks();

        statusItems = results.map((result) => ({
          tool: result.toolName,
          version: result.version,
          status: result.status,
          message: formatHealthMessage(result.toolName, result.version, result.status, result.notes),
          checkedAt: result.checkedAt,
        }));
      } else {
        yield* Effect.logDebug("Getting cached health check results...");
        // Get cached results
        const results = yield* healthCheckService.getLatestResults();

        if (results.length === 0) {
          yield* Effect.logInfo("No cached health check data found. Running fresh checks...");
          // No cached data, run fresh checks
          const freshResults = yield* healthCheckService.runHealthChecks();
          statusItems = freshResults.map((result) => ({
            tool: result.toolName,
            version: result.version,
            status: result.status,
            message: formatHealthMessage(result.toolName, result.version, result.status, result.notes),
            checkedAt: result.checkedAt,
          }));
        } else {
          statusItems = results.map((result) => ({
            tool: result.toolName,
            version: result.version,
            status: result.status,
            message: formatHealthMessage(result.toolName, result.version, result.status, result.notes),
            checkedAt: result.checkedAt,
          }));
        }
      }

      // Sort by tool name for consistent output
      statusItems.sort((a, b) => a.tool.localeCompare(b.tool));

      // Output results
      if (jsonOutput) {
        // Output ND-JSON (one object per tool)
        for (const item of statusItems) {
          yield* Effect.logInfo(JSON.stringify(item));
        }
      } else {
        // Human-readable output matching the specification format
        for (const item of statusItems) {
          const icon = item.status === "ok" ? "✔" : item.status === "warn" ? "⚠" : "✗";
          const versionText = item.version ? ` ${item.version}` : "";
          yield* Effect.logInfo(
            `${icon} ${item.tool}${versionText}${item.status === "warn" || item.status === "fail" ? ` (${item.status})` : ""}`,
          );
        }

        yield* Effect.logInfo("");

        const okCount = statusItems.filter((item) => item.status === "ok").length;
        const warnCount = statusItems.filter((item) => item.status === "warn").length;
        const failCount = statusItems.filter((item) => item.status === "fail").length;

        if (failCount > 0) {
          yield* Effect.logError(`❌ ${failCount} failing, ${warnCount} warnings, ${okCount} OK`);
        } else if (warnCount > 0) {
          yield* Effect.logWarning(`⚠️ ${warnCount} warnings, ${okCount} OK`);
        } else {
          yield* Effect.logInfo("All green. Have a great day! 🎉");
        }
      }

      // Exit with error code if there are failures
      const hasFailures = statusItems.some((item) => item.status === "fail");
      if (hasFailures) {
        const failedComponents = statusItems.filter((item) => item.status === "fail").map((item) => item.tool);
        const failCount = statusItems.filter((item) => item.status === "fail").length;
        const warnCount = statusItems.filter((item) => item.status === "warn").length;

        return yield* Effect.fail(
          statusCheckError(`Found ${failCount} failing tool(s) and ${warnCount} warning(s)`, failedComponents),
        );
      }
    } catch (error) {
      // Fallback to error state
      yield* Effect.logError(`Failed to get health check status: ${error}`);
      return yield* Effect.fail(unknownError(`Health check failed: ${error}`));
    }
  }),
);

/**
 * Format health check message for display
 */
function formatHealthMessage(toolName: string, version?: string, status?: string, notes?: string): string {
  const versionText = version ? ` ${version}` : "";
  const statusText = status && status !== "ok" ? ` (${status})` : "";
  const notesText = notes ? ` - ${notes}` : "";

  return `${toolName}${versionText}${statusText}${notesText}`;
}
