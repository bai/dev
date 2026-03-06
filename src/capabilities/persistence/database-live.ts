import { Database as BunSQLiteDatabase } from "bun:sqlite";
import path from "path";

import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Effect, Exit, Layer } from "effect";

import { Database, type DatabaseService } from "~/capabilities/persistence/database-port";
import type { DrizzleDatabase } from "~/capabilities/persistence/drizzle-types";
import { FileSystem } from "~/capabilities/system/file-system-port";
import { configError, unknownError, type ConfigError, type UnknownError } from "~/core/errors";
import { InstallPaths, StatePaths } from "~/core/runtime/path-service";

// Extended interface for internal use with close method
export interface DatabaseWithClose extends DatabaseService {
  readonly close: () => Effect.Effect<void>;
}

type DatabaseAccessSemaphore = ReturnType<typeof Effect.unsafeMakeSemaphore>;

export const createDatabaseService = (
  sqlite: BunSQLiteDatabase,
  drizzleDb: DrizzleDatabase,
  migrationsPath: string,
  accessSemaphore: DatabaseAccessSemaphore,
): DatabaseWithClose => {
  const withDatabasePermit = accessSemaphore.withPermits(1);

  const query = <A, E>(fn: (db: DrizzleDatabase) => Effect.Effect<A, E>): Effect.Effect<A, E | ConfigError | UnknownError> =>
    withDatabasePermit(
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
      }),
    );

  const transaction = <A, E>(fn: (tx: DrizzleDatabase) => Effect.Effect<A, E>): Effect.Effect<A, E | ConfigError | UnknownError> =>
    withDatabasePermit(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          yield* Effect.logDebug("Starting database transaction");
          yield* Effect.try({
            try: () => sqlite.exec("BEGIN"),
            catch: (error) => unknownError(`Failed to begin database transaction: ${error}`),
          });

          const transactionResult = yield* restore(fn(drizzleDb)).pipe(
            Effect.mapError((error) => {
              if (error && typeof error === "object" && "_tag" in error) {
                return error as E;
              }
              return unknownError(`Database transaction failed: ${error}`);
            }),
            Effect.exit,
          );

          if (Exit.isSuccess(transactionResult)) {
            yield* Effect.try({
              try: () => sqlite.exec("COMMIT"),
              catch: (error) => unknownError(`Failed to commit database transaction: ${error}`),
            });
            return transactionResult.value;
          }

          const rollbackResult = yield* Effect.try({
            try: () => sqlite.exec("ROLLBACK"),
            catch: (error) => unknownError(`Failed to rollback database transaction: ${error}`),
          }).pipe(Effect.exit);

          if (Exit.isFailure(rollbackResult)) {
            return yield* Effect.failCause(rollbackResult.cause);
          }

          return yield* Effect.failCause(transactionResult.cause);
        }),
      ),
    );

  const raw = (): Effect.Effect<BunSQLiteDatabase, ConfigError | UnknownError> => Effect.succeed(sqlite);

  const runMigrations = (): Effect.Effect<void, ConfigError | UnknownError> =>
    withDatabasePermit(
      Effect.gen(function* () {
        yield* Effect.logDebug(`Running database migrations from ${migrationsPath}`);
        yield* Effect.try({
          try: () => migrate(drizzleDb, { migrationsFolder: migrationsPath }),
          catch: (error) => configError(`Failed to run migrations: ${error}`),
        });
        yield* Effect.logDebug("Database migrations completed");
      }),
    );

  const close = (): Effect.Effect<void> =>
    withDatabasePermit(
      Effect.gen(function* () {
        yield* Effect.logDebug("Closing database connection");
        yield* Effect.sync(() => {
          // Checkpoint WAL before closing to ensure data is persisted
          sqlite.exec("PRAGMA wal_checkpoint(TRUNCATE);");
          sqlite.close();
        });
        yield* Effect.logDebug("Database connection closed");
      }),
    );

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
  const fileSystem = yield* FileSystem;
  const installPaths = yield* InstallPaths;
  const statePaths = yield* StatePaths;
  const dbPath = statePaths.dbPath;

  if (installPaths.installMode !== "repo") {
    return yield* configError("Standalone binary distribution is not supported yet");
  }

  // Ensure directory exists
  yield* fileSystem.mkdir(path.dirname(dbPath), true);

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
  const migrationsPath = path.join(installPaths.installDir, "drizzle", "migrations");
  const accessSemaphore = yield* Effect.makeSemaphore(1);

  // Create the database service
  const database = createDatabaseService(sqlite, drizzleDb, migrationsPath, accessSemaphore);

  // Run migrations
  yield* database.migrate();

  yield* Effect.logDebug(`Database initialized at ${dbPath}`);

  return database;
});

// Effect Layer for dependency injection with proper resource management
export const DatabaseLiveLayer = Layer.scoped(
  Database,
  Effect.gen(function* () {
    // Create the Database with proper resource management
    const database = yield* Effect.acquireRelease(createDatabase, (database) =>
      database.close().pipe(Effect.catchAll((error) => Effect.logWarning(`Failed to close database cleanly: ${error}`))),
    );

    // Return only the public Database interface, not the extended one with close
    const publicDatabase: DatabaseService = {
      query: database.query,
      transaction: database.transaction,
      raw: database.raw,
      migrate: database.migrate,
    };

    return publicDatabase;
  }),
);
