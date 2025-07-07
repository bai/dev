import type { Database as BunSQLiteDatabase } from "bun:sqlite";
import { Context, type Effect } from "effect";

import type { DrizzleDatabase } from "./drizzle-types";
import type { ConfigError, UnknownError } from "./errors";

/**
 * Database port for managing SQLite connections and operations
 * Provides a consistent interface for database operations across the application
 */
export interface DatabasePort {
  /**
   * Execute a database operation with the Drizzle instance
   */
  readonly query: <A, E>(
    fn: (db: DrizzleDatabase) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E | ConfigError | UnknownError>;

  /**
   * Execute a database operation within a transaction
   */
  readonly transaction: <A, E>(
    fn: (tx: DrizzleDatabase) => Effect.Effect<A, E>,
  ) => Effect.Effect<A, E | ConfigError | UnknownError>;

  /**
   * Get the raw SQLite database instance (for special operations like PRAGMA)
   */
  readonly raw: () => Effect.Effect<BunSQLiteDatabase, ConfigError | UnknownError>;

  /**
   * Run database migrations
   */
  readonly migrate: () => Effect.Effect<void, ConfigError | UnknownError>;
}

export class DatabasePortTag extends Context.Tag("DatabasePort")<DatabasePortTag, DatabasePort>() {}
