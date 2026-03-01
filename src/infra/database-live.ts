import { Database as BunSQLiteDatabase } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Effect, Layer } from "effect";

import { DatabaseTag, type Database } from "../domain/database-port";
import type { DrizzleDatabase } from "../domain/drizzle-types";
import { configError, unknownError, type ConfigError, type UnknownError } from "../domain/errors";
import { FileSystemTag } from "../domain/file-system-port";
import { PathServiceTag } from "../domain/path-service";

// Extended interface for internal use with close method
interface DatabaseWithClose extends Database {
  readonly close: () => Effect.Effect<void>;
}

// Factory function that creates Database service
export const makeDatabaseLive = (
  sqlite: BunSQLiteDatabase,
  drizzleDb: DrizzleDatabase,
  migrationsPath: string,
): DatabaseWithClose => {
  const query = <A, E>(
    fn: (db: DrizzleDatabase) => Effect.Effect<A, E>,
  ): Effect.Effect<A, E | ConfigError | UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Executing database query");
      return yield* fn(drizzleDb).pipe(
        Effect.mapError((error) => {
          if (error && typeof error === "object" && "_tag" in error) {
            return error as E;
          }
          return unknownError(`Database query failed: ${error}`);
        }),
      );
    });

  const transaction = <A, E>(
    fn: (tx: DrizzleDatabase) => Effect.Effect<A, E>,
  ): Effect.Effect<A, E | ConfigError | UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Starting database transaction");

      // For simplicity, we'll use the main database connection for now
      // In a production system, you'd want proper transaction support
      // For now, this provides the same interface but without true ACID transactions
      yield* Effect.logWarning("Transaction support is limited - using main database connection");
      return yield* fn(drizzleDb).pipe(
        Effect.mapError((error) => {
          if (error && typeof error === "object" && "_tag" in error) {
            return error as E;
          }
          return unknownError(`Database transaction failed: ${error}`);
        }),
      );
    });

  const raw = (): Effect.Effect<BunSQLiteDatabase, ConfigError | UnknownError> => Effect.succeed(sqlite);

  const runMigrations = (): Effect.Effect<void, ConfigError | UnknownError> =>
    Effect.gen(function* () {
      yield* Effect.logDebug(`Running database migrations from ${migrationsPath}`);
      yield* Effect.try({
        try: () => migrate(drizzleDb, { migrationsFolder: migrationsPath }),
        catch: (error) => configError(`Failed to run migrations: ${error}`),
      });
      yield* Effect.logDebug("Database migrations completed");
    });

  const close = (): Effect.Effect<void> =>
    Effect.gen(function* () {
      yield* Effect.logDebug("Closing database connection");
      yield* Effect.sync(() => {
        // Checkpoint WAL before closing to ensure data is persisted
        sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);");
        sqlite.close();
      });
      yield* Effect.logDebug("Database connection closed");
    });

  return {
    query,
    transaction,
    raw,
    migrate: runMigrations,
    close,
  };
};

// Create and initialize database with migrations
const createDatabase = Effect.gen(function* () {
  const fileSystem = yield* FileSystemTag;
  const pathService = yield* PathServiceTag;
  const dbPath = pathService.dbPath;

  // Ensure directory exists
  yield* fileSystem.mkdir(dbPath.split("/").slice(0, -1).join("/"), true);

  // Create database connection
  const sqlite = yield* Effect.try({
    try: () => {
      const db = new BunSQLiteDatabase(dbPath);
      db.run("PRAGMA journal_mode = WAL");
      db.run("PRAGMA synchronous = NORMAL");
      db.run("PRAGMA busy_timeout = 5000");
      db.run("PRAGMA cache_size = -64000");
      db.run("PRAGMA foreign_keys = ON");
      db.run("PRAGMA wal_checkpoint(PASSIVE)");
      return db;
    },
    catch: (error) => configError(`Failed to open database at ${dbPath}: ${error}`),
  });

  const drizzleDb = drizzle(sqlite);
  const migrationsPath = `${pathService.devDir}/drizzle/migrations`;

  // Create the database service
  const database = makeDatabaseLive(sqlite, drizzleDb, migrationsPath);

  // Run migrations
  yield* database.migrate();

  yield* Effect.logDebug(`Database initialized at ${dbPath}`);

  return database;
});

// Effect Layer for dependency injection with proper resource management
export const DatabaseLiveLayer = Layer.scoped(
  DatabaseTag,
  Effect.gen(function* () {
    // Create the Database with proper resource management
    const database = yield* Effect.acquireRelease(createDatabase, (database) =>
      database
        .close()
        .pipe(Effect.catchAll((error) => Effect.logWarning(`Failed to close database cleanly: ${error}`))),
    );

    // Return only the public Database interface, not the extended one with close
    const publicDatabase: Database = {
      query: database.query,
      transaction: database.transaction,
      raw: database.raw,
      migrate: database.migrate,
    };

    return publicDatabase;
  }),
);
