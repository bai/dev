
import { sql } from "drizzle-orm";
import { Clock, Duration, Effect, Layer } from "effect";

import { toolHealthChecks } from "../../../drizzle/schema";
import { healthCheckError, type HealthCheckError } from "../../domain/errors";
import { DatabasePortTag, type DatabasePort } from "../../domain/ports/database-port";
import {
  HealthCheckPortTag,
  type HealthCheckPort,
  type HealthCheckResult,
  type HealthCheckSummary,
} from "../../domain/ports/health-check-port";
import { PathServiceTag, type PathService } from "../../domain/services/path-service";
import { ConfigLoaderTag, type ConfigLoader } from "../../config/loader";
import { ShellPortTag, type ShellPort } from "../../domain/ports/shell-port";
import { HealthCheckServiceTag, type HealthCheckService } from "../../domain/services/health-check-service";

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

// Execute a shell command and return the result
const executeHealthCheckCommand = (
  command: string,
  shell: ShellPort,
): Effect.Effect<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }, HealthCheckError> =>
  Effect.gen(function* () {
    const parts = command.split(" ");
    const cmd = parts[0];
    const args = parts.slice(1);
    
    if (!cmd) {
      return yield* Effect.fail(healthCheckError(`Invalid command: ${command}`));
    }
    
    const result = yield* shell.exec(cmd, args).pipe(
      Effect.mapError(() => healthCheckError(`Command execution failed: ${command}`))
    );
    
    return result;
  });

// Parse tool version from command output
const parseToolVersion = (
  toolName: string,
  exitCode: number,
  stdout: string,
  stderr: string,
  parseOutput?: (stdout: string, stderr: string) => {
    readonly version?: string;
    readonly status?: "ok" | "warning" | "fail";
    readonly notes?: string;
  },
  versionPattern?: string,
): Effect.Effect<InternalHealthCheckResult, never> =>
  Effect.gen(function* () {
    const checkedAtMs = yield* Clock.currentTimeMillis;

    if (exitCode !== 0) {
      return {
        toolName,
        status: "fail" as const,
        notes: stderr.trim() || `Exit code: ${exitCode}`,
        checkedAt: checkedAtMs,
      };
    }

    // Parse version from output
    let version: string | undefined;
    let status: "ok" | "warning" | "fail" = "ok";
    let notes: string | undefined;

    // Use custom parseOutput function if provided
    if (parseOutput) {
      const result = parseOutput(stdout, stderr);
      version = result.version;
      status = result.status || "ok";
      notes = result.notes;
    } else if (versionPattern) {
      // Use regex pattern to extract version
      const regex = new RegExp(versionPattern);
      const match = stdout.match(regex);
      version = match?.[1] || stdout.trim();
    } else {
      // Default to using stdout as version
      version = stdout.trim();
    }

    return {
      toolName,
      version,
      status,
      notes,
      checkedAt: checkedAtMs,
    };
  });

// Probe a single tool for version and health
const probeToolVersion = (
  toolName: string, 
  command: string, 
  shell: ShellPort,
  parseOutput?: (stdout: string, stderr: string) => {
    readonly version?: string;
    readonly status?: "ok" | "warning" | "fail";
    readonly notes?: string;
  },
  versionPattern?: string,
  timeout?: number,
): Effect.Effect<InternalHealthCheckResult, HealthCheckError> => {
  const effect = executeHealthCheckCommand(command, shell).pipe(
    Effect.flatMap(({ exitCode, stdout, stderr }) => parseToolVersion(toolName, exitCode, stdout, stderr, parseOutput, versionPattern)),
    Effect.catchAll(() =>
      Effect.gen(function* () {
        const checkedAtMs = yield* Clock.currentTimeMillis;
        return {
          toolName,
          status: "fail" as const,
          notes: "Error running command",
          checkedAt: checkedAtMs,
        };
      }),
    ),
  );

  // Apply custom timeout if specified
  if (timeout) {
    return effect.pipe(
      Effect.timeout(Duration.millis(timeout)),
      Effect.catchTag("TimeoutException", () =>
        Effect.gen(function* () {
          const checkedAtMs = yield* Clock.currentTimeMillis;
          return {
            toolName,
            status: "fail" as const,
            notes: `Command timed out after ${timeout}ms`,
            checkedAt: checkedAtMs,
          };
        }),
      ),
    );
  }

  return effect;
};

// Store health check results using DatabasePort
const storeHealthCheckResults = (
  results: InternalHealthCheckResult[],
  database: DatabasePort,
): Effect.Effect<void, HealthCheckError> =>
  database
    .query((db) =>
      Effect.gen(function* () {
        // Insert all results in a transaction
        yield* Effect.tryPromise({
          try: async () => {
            const { toolHealthChecks } = await import("../../../drizzle/schema");
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
            const { toolHealthChecks } = await import("../../../drizzle/schema");
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
export const makeHealthCheckLive = (database: DatabasePort, pathService: PathService, configLoader: ConfigLoader, shell: ShellPort, healthCheckService: HealthCheckService): HealthCheckPort => {
  // Individual functions implementing the service methods
  const runHealthChecks = (): Effect.Effect<HealthCheckResult[], HealthCheckError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Running health checks synchronously...");

      // Load configuration
      const config = yield* configLoader.load().pipe(
        Effect.mapError((error) => healthCheckError(`Failed to load configuration: ${error}`)),
        Effect.catchAll(() => Effect.succeed(undefined)),
      );

      // Get health check configurations
      const healthCheckConfigs = yield* healthCheckService.getHealthCheckConfigs(config);

      // Run all probes in parallel
      const probeEffects = healthCheckConfigs.map((config) => {
        return probeToolVersion(
          config.toolName,
          config.command,
          shell,
          config.parseOutput,
          config.versionPattern,
          config.timeout,
        );
      });

      const results = yield* Effect.all(probeEffects, { concurrency: "unbounded" });

      // Store results in database
      yield* storeHealthCheckResults(results, database);

      yield* Effect.logDebug("Health checks completed successfully");

      // Return the latest results from database
      return yield* getLatestResults();
    });


  const getLatestResults = (): Effect.Effect<HealthCheckSummary[], HealthCheckError> =>
    database
      .query((db) =>
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
      );

  const pruneOldRecords = (
    retentionDays: number = HEALTH_CHECK_RETENTION_DAYS,
  ): Effect.Effect<void, HealthCheckError> =>
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
    });

  return {
    runHealthChecks,
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
    const configLoader = yield* ConfigLoaderTag;
    const shell = yield* ShellPortTag;
    const healthCheckService = yield* HealthCheckServiceTag;
    return makeHealthCheckLive(database, pathService, configLoader, shell, healthCheckService);
  }),
);
