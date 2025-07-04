import { Database } from "bun:sqlite";
import { desc, eq, isNull, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Clock, Effect, Layer } from "effect";

import { runs } from "../../../drizzle/schema";
import { configError, unknownError, type ConfigError, type UnknownError } from "../../domain/errors";
import type { CommandRun } from "../../domain/models";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { RunStoreService, type RunStore } from "../../domain/ports/RunStore";
import { PathServiceTag } from "../../domain/services/PathService";

// Extended RunStore interface that includes close method for resource management
interface RunStoreWithClose extends RunStore {
  close(): Effect.Effect<void>;
}

// Factory function that creates RunStore with database dependencies
export const makeRunStoreLive = (db: ReturnType<typeof drizzle>, sqlite: Database): RunStoreWithClose => {
  // Individual functions implementing the service methods
  const close = (): Effect.Effect<void> =>
    Effect.gen(function* () {
      yield* Effect.logInfo("Closing database connection...");
      yield* Effect.sync(() => {
        sqlite.close();
      });
      yield* Effect.logDebug("Database connection closed");
    });

  const record = (run: Omit<CommandRun, "id" | "duration_ms">): Effect.Effect<string, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      const result = yield* Effect.tryPromise({
        try: async () => {
          return await db
            .insert(runs)
            .values({
              id: Bun.randomUUIDv7(),
              cli_version: run.cli_version,
              command_name: run.command_name,
              arguments: run.arguments,
              cwd: run.cwd,
              started_at: run.started_at,
              finished_at: run.finished_at,
              exit_code: run.exit_code,
            })
            .returning({ id: runs.id });
        },
        catch: (error) => configError(`Failed to record command run: ${error}`),
      });

      const insertedRun = yield* Effect.fromNullable(result[0]).pipe(
        Effect.orElseFail(() => configError("Insert operation did not return a record")),
      );

      return insertedRun.id;
    });

  const complete = (id: string, exitCode: number, finishedAt: Date): Effect.Effect<void, ConfigError | UnknownError> =>
    Effect.tryPromise({
      try: async () => {
        await db
          .update(runs)
          .set({
            exit_code: exitCode,
            finished_at: finishedAt,
          })
          .where(eq(runs.id, id));
      },
      catch: (error) => configError(`Failed to complete command run: ${error}`),
    });

  const prune = (keepDays: number): Effect.Effect<void, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      const currentTimeMs = yield* Clock.currentTimeMillis;
      const cutoffDate = new Date(currentTimeMs);
      cutoffDate.setDate(cutoffDate.getDate() - keepDays);

      yield* Effect.tryPromise({
        try: async () => {
          await db.delete(runs).where(lt(runs.started_at, cutoffDate));
        },
        catch: (error) => configError(`Failed to prune old runs: ${error}`),
      });
    });

  const getRecentRuns = (limit: number): Effect.Effect<CommandRun[], ConfigError | UnknownError> =>
    Effect.tryPromise({
      try: async () => {
        const result = await db.select().from(runs).orderBy(desc(runs.started_at)).limit(limit);

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

  const completeIncompleteRuns = (): Effect.Effect<void, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      const currentTimeMs = yield* Clock.currentTimeMillis;
      const now = new Date(currentTimeMs);

      yield* Effect.tryPromise({
        try: async () => {
          // Mark any runs that don't have a finished_at as interrupted
          await db
            .update(runs)
            .set({
              exit_code: 130, // Standard exit code for SIGINT (Ctrl+C)
              finished_at: now,
            })
            .where(isNull(runs.finished_at));
        },
        catch: (error) => configError(`Failed to complete incomplete runs: ${error}`),
      });
    });

  return {
    record,
    complete,
    prune,
    getRecentRuns,
    completeIncompleteRuns,
    close,
  };
};

/**
 * Create and initialize database with migrations
 */
const createDatabase = (dbPath: string) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystemService;
    const pathService = yield* PathServiceTag;

    // Ensure directory exists
    yield* fileSystem.mkdir(dbPath.split("/").slice(0, -1).join("/"), true);

    // Create database connection
    const sqlite = yield* Effect.sync(() => {
      const db = new Database(dbPath);
      db.exec("PRAGMA journal_mode = WAL;");
      return db;
    });

    const drizzleDb = yield* Effect.sync(() => drizzle(sqlite));

    // Run migrations with absolute path to avoid issues when CLI is run from different directories
    const migrationsPath = `${pathService.devDir}/drizzle/migrations`;
    yield* Effect.sync(() => {
      migrate(drizzleDb, { migrationsFolder: migrationsPath });
    });

    yield* Effect.logDebug(`Database initialized at ${dbPath} with migrations from ${migrationsPath}`);

    return makeRunStoreLive(drizzleDb, sqlite);
  });

// Effect Layer for dependency injection with proper resource management
export const RunStoreLiveLayer = Layer.scoped(
  RunStoreService,
  Effect.gen(function* () {
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
