import { Database } from "bun:sqlite";
import { desc, eq, isNull, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Effect, Layer } from "effect";

import { runs } from "../../../drizzle/schema";
import { configError, unknownError, type ConfigError, type UnknownError } from "../../domain/errors";
import type { CommandRun } from "../../domain/models";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { RunStoreService, type RunStore } from "../../domain/ports/RunStore";
import { PathServiceTag } from "../../domain/services/PathService";

export class RunStoreLive implements RunStore {
  constructor(
    private readonly db: ReturnType<typeof drizzle>,
    private readonly sqlite: Database,
  ) {}

  /**
   * Close the database connection for graceful shutdown
   */
  close(): Effect.Effect<void> {
    const sqlite = this.sqlite;
    return Effect.gen(function* () {
      yield* Effect.logInfo("Closing database connection...");
      yield* Effect.sync(() => {
        sqlite.close();
      });
      yield* Effect.logDebug("Database connection closed");
    });
  }

  record(run: Omit<CommandRun, "id" | "duration_ms">): Effect.Effect<string, ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const id = crypto.randomUUID();
        await this.db.insert(runs).values({
          id,
          cli_version: run.cli_version,
          command_name: run.command_name,
          arguments: run.arguments,
          cwd: run.cwd,
          started_at: run.started_at,
          finished_at: run.finished_at,
          exit_code: run.exit_code,
        });
        return id;
      },
      catch: (error) => configError(`Failed to record command run: ${error}`),
    });
  }

  complete(id: string, exitCode: number, finishedAt: Date): Effect.Effect<void, ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .update(runs)
          .set({
            exit_code: exitCode,
            finished_at: finishedAt,
          })
          .where(eq(runs.id, id));
      },
      catch: (error) => configError(`Failed to complete command run: ${error}`),
    });
  }

  prune(keepDays: number): Effect.Effect<void, ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - keepDays);

        await this.db.delete(runs).where(lt(runs.started_at, cutoffDate));
      },
      catch: (error) => configError(`Failed to prune old runs: ${error}`),
    });
  }

  getRecentRuns(limit: number): Effect.Effect<CommandRun[], ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db.select().from(runs).orderBy(desc(runs.started_at)).limit(limit);

        return result.map((row) => ({
          id: row.id,
          cli_version: row.cli_version,
          command_name: row.command_name,
          arguments: row.arguments || undefined,
          exit_code: row.exit_code || undefined,
          cwd: row.cwd,
          started_at: new Date(row.started_at),
          finished_at: row.finished_at ? new Date(row.finished_at) : undefined,
          duration_ms: row.duration_ms || undefined,
        }));
      },
      catch: (error) => configError(`Failed to get recent runs: ${error}`),
    });
  }

  /**
   * Complete any incomplete command runs for graceful shutdown
   */
  completeIncompleteRuns(): Effect.Effect<void, ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const now = new Date();
        // Mark any runs that don't have a finished_at as interrupted
        await this.db
          .update(runs)
          .set({
            exit_code: 130, // Standard exit code for SIGINT (Ctrl+C)
            finished_at: now,
          })
          .where(isNull(runs.finished_at));
      },
      catch: (error) => configError(`Failed to complete incomplete runs: ${error}`),
    });
  }
}

// No-op implementation when storage is disabled
export class RunStoreNoOp implements RunStore {
  record(): Effect.Effect<string> {
    return Effect.succeed("noop");
  }

  complete(): Effect.Effect<void> {
    return Effect.void;
  }

  prune(): Effect.Effect<void> {
    return Effect.void;
  }

  getRecentRuns(): Effect.Effect<CommandRun[]> {
    return Effect.succeed([]);
  }

  completeIncompleteRuns(): Effect.Effect<void> {
    return Effect.void;
  }
}

/**
 * Create and initialize database with migrations
 */
const createDatabase = (dbPath: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystemService;

    // Ensure directory exists
    yield* fileSystem.mkdir(dbPath.split("/").slice(0, -1).join("/"), true);

    // Create database connection
    const sqlite = yield* Effect.sync(() => {
      const db = new Database(dbPath);
      db.exec("PRAGMA journal_mode = WAL;");
      return db;
    });

    const drizzleDb = yield* Effect.sync(() => drizzle(sqlite));

    // Run migrations
    yield* Effect.sync(() => {
      migrate(drizzleDb, { migrationsFolder: "./drizzle/migrations" });
    });

    yield* Effect.logDebug(`Database initialized at ${dbPath}`);

    return new RunStoreLive(drizzleDb, sqlite);
  });

// Effect Layer for dependency injection with proper resource management
export const RunStoreLiveLayer = Layer.scoped(
  RunStoreService,
  Effect.gen(function* () {
    // Check if storage is disabled
    if (process.env.DEV_CLI_STORE === "0") {
      return new RunStoreNoOp();
    }

    const pathService = yield* PathServiceTag;
    const dbPath = pathService.dbPath;

    // Create the RunStore with proper resource management
    const runStore = yield* Effect.acquireRelease(createDatabase(dbPath), (runStore) =>
      Effect.gen(function* () {
        yield* Effect.logInfo("Gracefully shutting down database...");

        // Complete incomplete runs, but don't fail shutdown if this fails
        yield* runStore
          .completeIncompleteRuns()
          .pipe(
            Effect.catchAll((error) =>
              Effect.logWarning(`Failed to complete incomplete runs during shutdown: ${error._tag}`),
            ),
          );

        yield* runStore
          .close()
          .pipe(Effect.catchAll((error) => Effect.logWarning(`Failed to close database cleanly: ${error}`)));
      }),
    );

    return runStore;
  }),
);
