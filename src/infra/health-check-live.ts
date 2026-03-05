import { sql } from "drizzle-orm";
import { Clock, Effect, Layer } from "effect";

import { toolHealthChecks } from "../../drizzle/schema";
import { DatabaseTag, type Database } from "../domain/database-port";
import { healthCheckError, type HealthCheckError } from "../domain/errors";
import { HealthCheckTag, type HealthCheck, type HealthCheckResult } from "../domain/health-check-port";
import { ToolHealthRegistryTag, type ToolHealthRegistry } from "../domain/tool-health-registry-port";
import { annotateErrorTypeOnFailure } from "./tracing/error-type";

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
    .transaction((tx) =>
      Effect.gen(function* () {
        // Insert all results in a transaction
        yield* Effect.forEach(
          results,
          (result) =>
            Effect.gen(function* () {
              const healthCheckId = yield* Effect.sync(() => Bun.randomUUIDv7());
              yield* Effect.tryPromise({
                try: async () => {
                  await tx.insert(toolHealthChecks).values({
                    id: healthCheckId,
                    tool_name: result.toolName,
                    version: result.version || null,
                    status: result.status,
                    notes: result.notes || null,
                    checked_at: new Date(result.checkedAt),
                  });
                },
                catch: (error) => healthCheckError(`Failed to insert health check results: ${error}`),
              });
            }),
          { discard: true },
        );

        yield* Effect.logDebug(`Stored ${results.length} health check results`);

        // Also run pruning while we have the database open
        const cutoffDateMs = yield* Clock.currentTimeMillis;
        const cutoffDate = new Date(cutoffDateMs - HEALTH_CHECK_RETENTION_DAYS * 24 * 60 * 60 * 1000);

        yield* Effect.tryPromise({
          try: async () => {
            await tx.delete(toolHealthChecks).where(sql`checked_at < ${cutoffDate}`);
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

// Factory function that creates HealthCheck service with dependencies
export const makeHealthCheckLive = (database: Database, toolHealthRegistry: ToolHealthRegistry): HealthCheck => {
  // Individual functions implementing the service methods
  const runHealthChecks = (): Effect.Effect<readonly HealthCheckResult[], HealthCheckError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Running health checks synchronously...");

      const results = yield* toolHealthRegistry.checkAllTools();

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
    }).pipe(annotateErrorTypeOnFailure, Effect.withSpan("health_check.run_all"));

  return {
    runHealthChecks,
  };
};

// Effect Layer for dependency injection
export const HealthCheckLiveLayer = Layer.effect(
  HealthCheckTag,
  Effect.gen(function* () {
    const database = yield* DatabaseTag;
    const toolHealthRegistry = yield* ToolHealthRegistryTag;
    return makeHealthCheckLive(database, toolHealthRegistry);
  }),
);
