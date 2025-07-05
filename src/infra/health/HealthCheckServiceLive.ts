import path from "path";
import { spawn } from "bun";

import { Database } from "bun:sqlite";
import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Effect, Layer } from "effect";

import { toolHealthChecks } from "../../../drizzle/schema";
import { healthCheckError, type HealthCheckError } from "../../domain/errors";
import {
  HealthCheckServiceTag,
  type HealthCheckResult,
  type HealthCheckService,
  type HealthCheckSummary,
} from "../../domain/ports/HealthCheckService";
import { PathServiceTag, type PathService } from "../../domain/services/PathService";

// Health check constants (internal, not user-configurable)
const HEALTH_CHECK_RETENTION_DAYS = 30;

// Factory function that creates HealthCheckService with dependencies
export const makeHealthCheckServiceLive = (pathService: PathService): HealthCheckService => {
  // Helper to get database connection
  const getDatabase = () =>
    Effect.tryPromise({
      try: async () => {
        const dbPath = pathService.dbPath;
        const sqlite = new Database(dbPath);
        sqlite.exec("PRAGMA journal_mode = WAL;");
        const db = drizzle(sqlite);
        return { db, sqlite };
      },
      catch: (error) => healthCheckError(`Failed to connect to database: ${error}`),
    });

  // Individual functions implementing the service methods
  const runHealthChecks = (): Effect.Effect<HealthCheckResult[], HealthCheckError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Running health checks synchronously...");

      // Import and run the health checks directly
      const { runHealthChecks: runChecks } = yield* Effect.tryPromise({
        try: () => import("../../health/runChecks"),
        catch: (error) => healthCheckError(`Failed to import health check worker: ${error}`),
      });

      yield* runChecks();

      // Return the latest results
      return yield* getLatestResults();
    });

  const runHealthChecksBackground = (): Effect.Effect<void, HealthCheckError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Spawning health check worker in background...");

      // Get the path to the health check worker script
      const workerPath = path.join(pathService.devDir, "src", "health", "runChecks.ts");

      yield* Effect.tryPromise({
        try: async () => {
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
    Effect.gen(function* () {
      const { db, sqlite } = yield* getDatabase();

      try {
        // Get the latest health check for each tool
        const results = yield* Effect.tryPromise({
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
        });

        return results;
      } finally {
        sqlite.close();
      }
    });

  const pruneOldRecords = (
    retentionDays: number = HEALTH_CHECK_RETENTION_DAYS,
  ): Effect.Effect<void, HealthCheckError> =>
    Effect.gen(function* () {
      const { db, sqlite } = yield* getDatabase();

      try {
        const cutoffDate = Math.floor(Date.now() / 1000) - retentionDays * 24 * 60 * 60;

        yield* Effect.tryPromise({
          try: async () => {
            await db.delete(toolHealthChecks).where(sql`checked_at < ${cutoffDate}`);
          },
          catch: (error) => healthCheckError(`Failed to prune old health check records: ${error}`),
        });

        yield* Effect.logInfo(`Pruned health check records older than ${retentionDays} days`);
      } finally {
        sqlite.close();
      }
    });

  return {
    runHealthChecks,
    runHealthChecksBackground,
    getLatestResults,
    pruneOldRecords,
  };
};

// Effect Layer for dependency injection
export const HealthCheckServiceLiveLayer = Layer.effect(
  HealthCheckServiceTag,
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    return makeHealthCheckServiceLive(pathService);
  }),
);
