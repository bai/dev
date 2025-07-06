import os from "os";
import path from "path";

import { BunRuntime } from "@effect/platform-bun";
import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Clock, Effect } from "effect";

import { toolHealthChecks } from "../../../drizzle/schema";
import { healthCheckError, type HealthCheckError } from "../../domain/errors";

// Health check probe commands (internal, not user-configurable)
const PROBE_COMMANDS = {
  bun: "bun --version",
  git: "git --version",
  mise: "mise --version",
  fzf: "fzf --version",
  gcloud: "gcloud --version",
  network: "ping -c1 8.8.8.8",
} as const;

const RETENTION_DAYS = 30;

type ToolName = keyof typeof PROBE_COMMANDS;
type HealthStatus = "ok" | "warn" | "fail";

interface HealthCheckResult {
  toolName: ToolName;
  version?: string;
  status: HealthStatus;
  notes?: string;
  checkedAt: number;
}

// Execute a shell command and return the result
const executeCommand = (
  command: string,
): Effect.Effect<{ exitCode: number; stdout: string; stderr: string }, HealthCheckError> =>
  Effect.tryPromise({
    try: async () => {
      const proc = Bun.spawn(command.split(" "), {
        stdout: "pipe",
        stderr: "pipe",
      });

      const exitCode = await proc.exited;
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();

      return { exitCode, stdout, stderr };
    },
    catch: (error) => healthCheckError(`Command execution failed: ${error}`),
  });

// Parse tool version from command output
const parseToolVersion = (
  toolName: ToolName,
  exitCode: number,
  stdout: string,
  stderr: string,
): Effect.Effect<HealthCheckResult, never> =>
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
    let status: HealthStatus = "ok";
    let notes: string | undefined;

    // Tool-specific version parsing
    switch (toolName) {
      case "bun":
        version = stdout.trim();
        break;
      case "git": {
        const match = stdout.match(/git version (.+)/);
        if (match?.[1]) {
          version = match[1].trim();
        }
        break;
      }
      case "mise":
        version = stdout.trim();
        break;
      case "fzf":
        version = stdout.trim();
        break;
      case "gcloud": {
        const match = stdout.match(/Google Cloud SDK (.+)/);
        version = match?.[1]?.trim() || undefined;
        break;
      }
      case "network": {
        // For ping, check round-trip time
        const rttMatch = stdout.match(/time=([0-9.]+)\s*ms/);
        const rtt = rttMatch && rttMatch[1] ? parseFloat(rttMatch[1]) : null;

        if (rtt !== null) {
          version = `${rtt}ms RTT`;
          if (rtt > 100) {
            status = "warn";
            notes = "High network latency";
          }
        } else {
          status = "warn";
          notes = "Unable to parse ping response";
        }
        break;
      }
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
const probeVersion = (toolName: ToolName, command: string): Effect.Effect<HealthCheckResult, HealthCheckError> =>
  executeCommand(command).pipe(
    Effect.flatMap(({ exitCode, stdout, stderr }) => parseToolVersion(toolName, exitCode, stdout, stderr)),
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

// Get database path following XDG Base Directory Specification
const getDbPath = (): string =>
  path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share"), "dev", "dev.db");

// Create a database connection with proper resource management
const withDatabase = <A>(
  fn: (db: ReturnType<typeof drizzle>, sqlite: Database) => Effect.Effect<A, HealthCheckError>,
): Effect.Effect<A, HealthCheckError> =>
  Effect.acquireUseRelease(
    Effect.try({
      try: () => {
        const dbPath = getDbPath();
        const sqlite = new Database(dbPath);
        sqlite.exec("PRAGMA journal_mode = WAL;");
        return { sqlite, db: drizzle(sqlite) };
      },
      catch: (error) => healthCheckError(`Failed to open database: ${error}`),
    }),
    ({ db, sqlite }) => fn(db, sqlite),
    ({ sqlite }) => Effect.sync(() => sqlite.close()),
  );

// Store health check results in database
const storeResults = (results: HealthCheckResult[]): Effect.Effect<void, HealthCheckError> =>
  withDatabase((db, sqlite) =>
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
      const cutoffDate = new Date(cutoffDateMs - RETENTION_DAYS * 24 * 60 * 60 * 1000);
      yield* Effect.tryPromise({
        try: async () => {
          await db.delete(toolHealthChecks).where(sql`checked_at < ${cutoffDate}`);
        },
        catch: (error) => healthCheckError(`Failed to prune old records: ${error}`),
      });

      // Checkpoint WAL to ensure data is persisted
      yield* Effect.sync(() => sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);"));
    }),
  );

// Main function to run all health checks
export const runHealthChecks = (): Effect.Effect<void, HealthCheckError> =>
  Effect.gen(function* () {
    yield* Effect.logDebug("Running health checks...");

    // Run all probes in parallel
    const probeEffects = Object.entries(PROBE_COMMANDS).map(([toolName, command]) =>
      probeVersion(toolName as ToolName, command),
    );

    const results = yield* Effect.all(probeEffects, { concurrency: "unbounded" });

    // Store results in database
    yield* storeResults(results);

    yield* Effect.logDebug("Health checks completed successfully");
  });

// CLI entry point - run if this script is executed directly
if (import.meta.main) {
  runHealthChecks().pipe(
    Effect.tapError((error) => Effect.logError(`Health check failed: ${error.reason}`)),
    BunRuntime.runMain,
  );
}
