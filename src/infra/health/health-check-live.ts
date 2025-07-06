import path from "path";
import { spawn } from "bun";

import { sql } from "drizzle-orm";
import { Clock, Effect, Layer } from "effect";

import { toolHealthChecks } from "../../../drizzle/schema";
import { healthCheckError, type HealthCheckError } from "../../domain/errors";
import { DatabasePortTag, type DatabasePort } from "../../domain/ports/database-port";
import {
  HealthCheckPortTag,
  type HealthCheckResult,
  type HealthCheckPort,
  type HealthCheckSummary,
} from "../../domain/ports/health-check-port";
import { PathServiceTag, type PathService } from "../../domain/services/path-service";

// Health check constants (internal, not user-configurable)
const HEALTH_CHECK_RETENTION_DAYS = 30;

// Factory function that creates HealthCheckService with dependencies
export const makeHealthCheckLive = (database: DatabasePort, pathService: PathService): HealthCheckPort => {

  // Individual functions implementing the service methods
  const runHealthChecks = (): Effect.Effect<HealthCheckResult[], HealthCheckError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Running health checks synchronously...");

      // Import and run the health checks directly
      const module = yield* Effect.tryPromise({
        try: () => import("./run-checks"),
        catch: (error) => healthCheckError(`Failed to import health check worker: ${error}`),
      });
      
      const runChecks = module.runHealthChecks;

      yield* runChecks();

      // Return the latest results
      return yield* getLatestResults();
    });

  const runHealthChecksBackground = (): Effect.Effect<void, HealthCheckError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Spawning health check worker in background...");

      // Get the path to the health check worker script
      const workerPath = path.join(pathService.devDir, "src", "infra", "health", "run-checks.ts");

      yield* Effect.try({
        try: () => {
          // Spawn worker process in background
          const proc = spawn(["bun", "run", workerPath], {
            stdio: ["ignore", "ignore", "ignore"],
          });

          // Don't wait for completion
          proc.unref();
        },
        catch: (error) => healthCheckError(`Failed to spawn health check worker: ${error}`),
      });

      yield* Effect.logDebug("Health check worker spawned successfully");
    });

  const getLatestResults = (): Effect.Effect<HealthCheckSummary[], HealthCheckError> =>
    database.query((db) =>
        Effect.tryPromise({
          try: async () => {
            // Use a subquery to get the latest check for each tool
            const latestChecks = await db
              .select()
              .from(toolHealthChecks)
              .where(
                sql`(tool_name, checked_at) IN (
                  SELECT tool_name, MAX(checked_at)
                  FROM tool_health_checks
                  GROUP BY tool_name
                )`,
              )
              .orderBy(toolHealthChecks.tool_name);

            return latestChecks.map((check) => ({
              toolName: check.tool_name,
              version: check.version || undefined,
              status: check.status as "ok" | "warn" | "fail",
              notes: check.notes || undefined,
              checkedAt: new Date(check.checked_at),
            }));
          },
          catch: (error) => healthCheckError(`Failed to get latest health check results: ${error}`),
      }),
    ).pipe(
      Effect.mapError((error) => {
        if (error._tag === "HealthCheckError") return error;
        return healthCheckError(`Database query failed: ${String(error)}`);
      }),
    );

  const pruneOldRecords = (
    retentionDays: number = HEALTH_CHECK_RETENTION_DAYS,
  ): Effect.Effect<void, HealthCheckError> =>
    Effect.gen(function* () {
      const cutoffDateMs = yield* Clock.currentTimeMillis;
      const cutoffDate = new Date(cutoffDateMs - retentionDays * 24 * 60 * 60 * 1000);

      yield* database.query((db) =>
        Effect.tryPromise({
          try: async () => {
            await db.delete(toolHealthChecks).where(sql`checked_at < ${cutoffDate}`);
          },
          catch: (error) => healthCheckError(`Failed to prune old health check records: ${error}`),
        }),
      ).pipe(
        Effect.mapError((error) => {
          if (error._tag === "HealthCheckError") return error;
          return healthCheckError(`Database operation failed: ${String(error)}`);
        }),
      );

      yield* Effect.logDebug(`Pruned health check records older than ${retentionDays} days`);
    });

  return {
    runHealthChecks,
    runHealthChecksBackground,
    getLatestResults,
    pruneOldRecords,
  };
};

// Effect Layer for dependency injection
export const HealthCheckPortLiveLayer = Layer.effect(
  HealthCheckPortTag,
  Effect.gen(function* () {
    const database = yield* DatabasePortTag;
    const pathService = yield* PathServiceTag;
    return makeHealthCheckLive(database, pathService);
  }),
);
