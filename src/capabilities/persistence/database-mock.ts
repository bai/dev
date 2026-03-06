import type { Database as BunSQLiteDatabase } from "bun:sqlite";

import { Effect } from "effect";

import type { DatabaseService } from "~/capabilities/persistence/database-port";
import type { DrizzleDatabase } from "~/capabilities/persistence/drizzle-types";
import type { ConfigError, UnknownError } from "~/core/errors";

interface DatabaseMockOverrides {
  readonly query?: DatabaseService["query"];
  readonly transaction?: DatabaseService["transaction"];
  readonly raw?: DatabaseService["raw"];
  readonly migrate?: DatabaseService["migrate"];
}

interface DatabaseMockOptions {
  readonly queryDb?: DrizzleDatabase;
  readonly transactionDb?: DrizzleDatabase;
  readonly rawDb?: BunSQLiteDatabase;
  readonly overrides?: DatabaseMockOverrides;
}

export class DatabaseMock implements DatabaseService {
  public queryCalls = 0;
  public transactionCalls = 0;
  public rawCalls = 0;
  public migrateCalls = 0;

  private readonly queryDb?: DrizzleDatabase;
  private readonly transactionDb?: DrizzleDatabase;
  private readonly rawDb?: BunSQLiteDatabase;
  private readonly overrides: DatabaseMockOverrides;

  constructor(options: DatabaseMockOptions = {}) {
    this.queryDb = options.queryDb;
    this.transactionDb = options.transactionDb ?? options.queryDb;
    this.rawDb = options.rawDb;
    this.overrides = options.overrides ?? {};
  }

  query<A, E>(fn: (db: DrizzleDatabase) => Effect.Effect<A, E>): Effect.Effect<A, E | ConfigError | UnknownError> {
    this.queryCalls += 1;

    if (this.overrides.query) {
      return this.overrides.query(fn);
    }

    return fn((this.queryDb ?? ({} as DrizzleDatabase)) as DrizzleDatabase);
  }

  transaction<A, E>(fn: (tx: DrizzleDatabase) => Effect.Effect<A, E>): Effect.Effect<A, E | ConfigError | UnknownError> {
    this.transactionCalls += 1;

    if (this.overrides.transaction) {
      return this.overrides.transaction(fn);
    }

    return fn((this.transactionDb ?? ({} as DrizzleDatabase)) as DrizzleDatabase);
  }

  raw(): Effect.Effect<BunSQLiteDatabase, ConfigError | UnknownError> {
    this.rawCalls += 1;

    if (this.overrides.raw) {
      return this.overrides.raw();
    }

    return Effect.succeed((this.rawDb ?? ({} as BunSQLiteDatabase)) as BunSQLiteDatabase);
  }

  migrate(): Effect.Effect<void, ConfigError | UnknownError> {
    this.migrateCalls += 1;

    if (this.overrides.migrate) {
      return this.overrides.migrate();
    }

    return Effect.void;
  }
}
