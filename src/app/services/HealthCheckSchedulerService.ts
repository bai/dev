import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Clock, Context, Effect, Layer } from "effect";

import { toolHealthChecks } from "../../../drizzle/schema";
import { healthCheckError, type HealthCheckError } from "../../domain/errors";
import { HealthCheckServiceTag, type HealthCheckService } from "../../domain/ports/HealthCheckService";
import { PathServiceTag, type PathService } from "../../domain/services/PathService";

// Health scheduler constants (internal, not user-configurable)
const HEALTH_CHECK_INTERVAL_HOURS = 6;

export interface HealthCheckSchedulerService {
  /**
   * Schedule background health checks to run at intervals
   */
  scheduleHealthChecks(): Effect.Effect<void, HealthCheckError>;

  /**
   * Check if enough time has passed since last check to warrant running again
   */
  shouldRunHealthCheck(): Effect.Effect<boolean, HealthCheckError>;
}

export class HealthCheckSchedulerServiceTag extends Context.Tag("HealthCheckSchedulerService")<
  HealthCheckSchedulerServiceTag,
  HealthCheckSchedulerService
>() {}

// Factory function that creates HealthCheckSchedulerService with dependencies
export const makeHealthCheckSchedulerServiceLive = (
  healthCheckService: HealthCheckService,
  pathService: PathService,
): HealthCheckSchedulerService => {
  // Query database for the most recent health check timestamp
  const getLastCheckTime = (): Effect.Effect<number, HealthCheckError> =>
    Effect.tryPromise({
      try: async () => {
        const dbPath = pathService.dbPath;
        const sqlite = new Database(dbPath);
        sqlite.exec("PRAGMA journal_mode = WAL;");
        const db = drizzle(sqlite);

        try {
          // Get the most recent health check timestamp across all tools
          const result = await db
            .select({ checkedAt: toolHealthChecks.checked_at })
            .from(toolHealthChecks)
            .orderBy(sql`checked_at DESC`)
            .limit(1);

          if (result.length > 0 && result[0]) {
            // Convert from Date back to timestamp (seconds)
            return Math.floor(result[0].checkedAt.getTime() / 1000);
          }

          // No health checks found, return 0 (Unix epoch)
          return 0;
        } finally {
          sqlite.close();
        }
      },
      catch: (error) => healthCheckError(`Failed to query last health check timestamp: ${error}`),
    });

  const shouldRunHealthCheck = (): Effect.Effect<boolean, HealthCheckError> =>
    Effect.gen(function* () {
      const lastCheckTime = yield* getLastCheckTime();
      const nowMs = yield* Clock.currentTimeMillis;
      const now = Math.floor(nowMs / 1000);
      const intervalSeconds = HEALTH_CHECK_INTERVAL_HOURS * 60 * 60;

      const shouldRun = now - lastCheckTime >= intervalSeconds;

      if (shouldRun) {
        yield* Effect.logDebug(`Health check interval reached (${HEALTH_CHECK_INTERVAL_HOURS}h)`);
      } else {
        const nextCheckIn = Math.ceil((lastCheckTime + intervalSeconds - now) / 60);
        yield* Effect.logDebug(`Next health check in ${nextCheckIn} minutes`);
      }

      return shouldRun;
    });

  const scheduleHealthChecks = (): Effect.Effect<void, HealthCheckError> =>
    Effect.gen(function* () {
      const shouldRun = yield* shouldRunHealthCheck();

      if (shouldRun) {
        yield* Effect.logDebug("Scheduling background health check...");

        // Run health checks in background
        // No need to update timestamp separately - the health checks will insert new records
        yield* healthCheckService.runHealthChecksBackground();

        yield* Effect.logDebug("Background health check scheduled successfully");
      }
    });

  return {
    scheduleHealthChecks,
    shouldRunHealthCheck,
  };
};

// Effect Layer for dependency injection
export const HealthCheckSchedulerServiceLiveLayer = Layer.effect(
  HealthCheckSchedulerServiceTag,
  Effect.gen(function* () {
    const healthCheckService = yield* HealthCheckServiceTag;
    const pathService = yield* PathServiceTag;
    return makeHealthCheckSchedulerServiceLive(healthCheckService, pathService);
  }),
);
