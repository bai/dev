import { sql } from "drizzle-orm";
import { Clock, Effect, Layer } from "effect";

import { toolHealthChecks } from "../../drizzle/schema";
import { DatabaseTag, type Database } from "../domain/database-port";
import { healthCheckError, type HealthCheckError } from "../domain/errors";
import { HealthCheckTag, type HealthCheck, type HealthCheckResult } from "../domain/health-check-port";
import { HealthCheckServiceTag, type HealthCheckService } from "../domain/health-check-service";

// Health check constants (internal, not user-configurable)
const HEALTH_CHECK_RETENTION_DAYS = 30;

// Internal health check result type (matches database schema)
interface InternalHealthCheckResult {
  readonly toolName: string;
  readonly version?: string;
  readonly status: "ok" | "warning" | "fail";
  readonly notes?: string;
  readonly checkedAt: number;
}

// Store health check results using Database
const storeHealthCheckResults = (results: InternalHealthCheckResult[], database: Database): Effect.Effect<void, HealthCheckError> =>
  database
    .query((db) =>
      Effect.gen(function* () {
        // Insert all results in a transaction
        yield* Effect.tryPromise({
          try: async () => {
            await db.transaction(async (tx) => {
              for (const result of results) {
                await tx.insert(toolHealthChecks).values({
                  id: Bun.randomUUIDv7(),
                  tool_name: result.toolName,
                  version: result.version || null,
                  status: result.status,
                  notes: result.notes || null,
                  checked_at: new Date(result.checkedAt),
                });
              }
            });
          },
          catch: (error) => healthCheckError(`Failed to insert health check results: ${error}`),
        });

        yield* Effect.logDebug(`Stored ${results.length} health check results`);

        // Also run pruning while we have the database open
        const cutoffDateMs = yield* Clock.currentTimeMillis;
        const cutoffDate = new Date(cutoffDateMs - HEALTH_CHECK_RETENTION_DAYS * 24 * 60 * 60 * 1000);

        yield* Effect.tryPromise({
          try: async () => {
            await db.delete(toolHealthChecks).where(sql`checked_at < ${cutoffDate}`);
          },
          catch: (error) => healthCheckError(`Failed to prune old records: ${error}`),
        });
      }),
    )
    .pipe(
      Effect.mapError((error) => {
        if (error._tag === "HealthCheckError") return error;
        return healthCheckError(`Database operation failed: ${String(error)}`);
      }),
    );

// Factory function that creates HealthCheckService with dependencies
export const makeHealthCheckLive = (database: Database, healthCheckService: HealthCheckService): HealthCheck => {
  // Individual functions implementing the service methods
  const runHealthChecks = (): Effect.Effect<readonly HealthCheckResult[], HealthCheckError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Running health checks synchronously...");

      const results = yield* healthCheckService.runAllHealthChecks();

      const internalResults: InternalHealthCheckResult[] = results.map((result) => ({
        toolName: result.toolName,
        version: result.version,
        status: result.status,
        notes: result.notes,
        checkedAt: result.checkedAt.getTime(),
      }));

      yield* storeHealthCheckResults(internalResults, database);

      yield* Effect.logDebug("Health checks completed successfully");

      return results;
    }).pipe(Effect.withSpan("health_check.run_all"));

  const getLatestResults = (): Effect.Effect<readonly HealthCheckResult[], HealthCheckError> =>
    database
      .query((db) =>
        Effect.tryPromise({
          try: async () => {
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
              status: check.status as "ok" | "warning" | "fail",
              notes: check.notes || undefined,
              checkedAt: new Date(check.checked_at),
            }));
          },
          catch: (error) => healthCheckError(`Failed to get latest health check results: ${error}`),
        }),
      )
      .pipe(
        Effect.mapError((error) => {
          if (error._tag === "HealthCheckError") return error;
          return healthCheckError(`Database query failed: ${String(error)}`);
        }),
        Effect.withSpan("health_check.get_latest"),
      );

  const pruneOldRecords = (retentionDays: number = HEALTH_CHECK_RETENTION_DAYS): Effect.Effect<void, HealthCheckError> =>
    Effect.gen(function* () {
      const cutoffDateMs = yield* Clock.currentTimeMillis;
      const cutoffDate = new Date(cutoffDateMs - retentionDays * 24 * 60 * 60 * 1000);

      yield* database
        .query((db) =>
          Effect.tryPromise({
            try: async () => {
              await db.delete(toolHealthChecks).where(sql`checked_at < ${cutoffDate}`);
            },
            catch: (error) => healthCheckError(`Failed to prune old health check records: ${error}`),
          }),
        )
        .pipe(
          Effect.mapError((error) => {
            if (error._tag === "HealthCheckError") return error;
            return healthCheckError(`Database operation failed: ${String(error)}`);
          }),
        );

      yield* Effect.logDebug(`Pruned health check records older than ${retentionDays} days`);
    }).pipe(Effect.withSpan("health_check.prune", { attributes: { "health_check.retention_days": retentionDays } }));

  return {
    runHealthChecks,
    getLatestResults,
    pruneOldRecords,
  };
};

// Effect Layer for dependency injection
export const HealthCheckLiveLayer = Layer.effect(
  HealthCheckTag,
  Effect.gen(function* () {
    const database = yield* DatabaseTag;
    const healthCheckService = yield* HealthCheckServiceTag;
    return makeHealthCheckLive(database, healthCheckService);
  }),
);
