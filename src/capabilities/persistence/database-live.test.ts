import { Database as BunSQLiteDatabase } from "bun:sqlite";

import { it } from "@effect/vitest";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Deferred, Effect, Fiber, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import { createDatabaseService, DatabaseLiveLayer } from "~/capabilities/persistence/database-live";
import { Database } from "~/capabilities/persistence/database-port";
import type { DrizzleDatabase } from "~/capabilities/persistence/drizzle-types";
import { FileSystemMock } from "~/capabilities/system/file-system-mock";
import { FileSystem } from "~/capabilities/system/file-system-port";
import { configError } from "~/core/errors";
import { InstallPaths, StatePaths } from "~/core/runtime/path-service";
import { makeInstallPathsMock, makeStatePathsMock } from "~/core/runtime/path-service-mock";

const isTaggedError = (error: unknown): error is { readonly _tag: string; readonly message: string } =>
  typeof error === "object" && error !== null && "_tag" in error && "message" in error && typeof error.message === "string";

const createSqliteMock = () => {
  const exec = vi.fn();
  const close = vi.fn();
  return {
    sqlite: {
      exec,
      close,
    } as unknown as BunSQLiteDatabase,
    exec,
    close,
  };
};

const makeTestDatabase = (sqlite: BunSQLiteDatabase, drizzleDb: DrizzleDatabase, migrationsPath: string) =>
  Effect.gen(function* () {
    const accessSemaphore = yield* Effect.makeSemaphore(1);
    return createDatabaseService(sqlite, drizzleDb, migrationsPath, accessSemaphore);
  });

describe("database-live", () => {
  it.effect("query delegates to drizzle database and returns the callback result", () =>
    Effect.gen(function* () {
      const { sqlite } = createSqliteMock();
      const drizzleDb = { marker: "drizzle-db" } as unknown as DrizzleDatabase;
      const database = yield* makeTestDatabase(sqlite, drizzleDb, "/tmp/migrations");

      const value = yield* database.query((db) => Effect.succeed(db === drizzleDb));

      expect(value).toBe(true);
    }),
  );

  it.effect("query preserves tagged domain errors", () =>
    Effect.gen(function* () {
      const { sqlite } = createSqliteMock();
      const drizzleDb = {} as DrizzleDatabase;
      const database = yield* makeTestDatabase(sqlite, drizzleDb, "/tmp/migrations");
      const taggedError = configError("query failed");

      const error = yield* Effect.flip(database.query(() => Effect.fail(taggedError)));

      expect(error).toBe(taggedError);
    }),
  );

  it.effect("query maps untagged errors to UnknownError", () =>
    Effect.gen(function* () {
      const { sqlite } = createSqliteMock();
      const drizzleDb = {} as DrizzleDatabase;
      const database = yield* makeTestDatabase(sqlite, drizzleDb, "/tmp/migrations");

      const error = yield* Effect.flip(database.query(() => Effect.fail("boom")));

      expect(isTaggedError(error)).toBe(true);
      if (isTaggedError(error)) {
        expect(error._tag).toBe("UnknownError");
        expect(error.message).toContain("Database query failed");
      }
    }),
  );

  it.effect("transaction maps untagged errors to UnknownError", () =>
    Effect.gen(function* () {
      const { sqlite } = createSqliteMock();
      const drizzleDb = {} as DrizzleDatabase;
      const database = yield* makeTestDatabase(sqlite, drizzleDb, "/tmp/migrations");

      const error = yield* Effect.flip(database.transaction(() => Effect.fail(new Error("tx failed"))));

      expect(isTaggedError(error)).toBe(true);
      if (isTaggedError(error)) {
        expect(error._tag).toBe("UnknownError");
        expect(error.message).toContain("Database transaction failed");
      }
    }),
  );

  it.effect("transaction commits all writes on success", () =>
    Effect.gen(function* () {
      const sqlite = new BunSQLiteDatabase(":memory:");
      const drizzleDb: DrizzleDatabase = drizzle(sqlite);
      const database = yield* makeTestDatabase(sqlite, drizzleDb, "/tmp/migrations");

      yield* Effect.sync(() => {
        sqlite.exec("create table tx_probe (id integer primary key, value text not null)");
      });

      yield* database.transaction((tx) =>
        Effect.sync(() => {
          tx.run(sql`insert into tx_probe (value) values (${"first"})`);
          tx.run(sql`insert into tx_probe (value) values (${"second"})`);
        }),
      );

      const rowCount = yield* Effect.sync(() => {
        const result = sqlite.query("select count(*) as count from tx_probe").get() as { readonly count: number };
        return Number(result.count);
      });

      expect(rowCount).toBe(2);
      yield* database.close();
    }),
  );

  it.effect("transaction rolls back writes when callback fails", () =>
    Effect.gen(function* () {
      const sqlite = new BunSQLiteDatabase(":memory:");
      const drizzleDb: DrizzleDatabase = drizzle(sqlite);
      const database = yield* makeTestDatabase(sqlite, drizzleDb, "/tmp/migrations");
      const taggedFailure = configError("force rollback");

      yield* Effect.sync(() => {
        sqlite.exec("create table tx_probe (id integer primary key, value text not null)");
      });

      const error = yield* Effect.flip(
        database.transaction((tx) =>
          Effect.gen(function* () {
            yield* Effect.sync(() => {
              tx.run(sql`insert into tx_probe (value) values (${"first"})`);
            });
            yield* Effect.promise(() => Promise.resolve());
            yield* Effect.sync(() => {
              tx.run(sql`insert into tx_probe (value) values (${"second"})`);
            });
            return yield* Effect.fail(taggedFailure);
          }),
        ),
      );

      expect(error).toBe(taggedFailure);

      const rowCount = yield* Effect.sync(() => {
        const result = sqlite.query("select count(*) as count from tx_probe").get() as { readonly count: number };
        return Number(result.count);
      });

      expect(rowCount).toBe(0);
      yield* database.close();
    }),
  );

  it.effect("transaction blocks concurrent queries until commit", () =>
    Effect.gen(function* () {
      const sqlite = new BunSQLiteDatabase(":memory:");
      const drizzleDb: DrizzleDatabase = drizzle(sqlite);
      const database = yield* makeTestDatabase(sqlite, drizzleDb, "/tmp/migrations");
      const transactionReady = yield* Deferred.make<void>();
      const releaseTransaction = yield* Deferred.make<void>();

      yield* Effect.sync(() => {
        sqlite.exec("create table tx_probe (id integer primary key, value text not null)");
      });

      const transactionFiber = yield* Effect.fork(
        database.transaction((tx) =>
          Effect.gen(function* () {
            yield* Effect.sync(() => {
              tx.run(sql`insert into tx_probe (value) values (${"txrow"})`);
            });
            yield* Deferred.succeed(transactionReady, undefined);
            yield* Deferred.await(releaseTransaction);
          }),
        ),
      );

      yield* Deferred.await(transactionReady);

      const queryFiber = yield* Effect.fork(
        database.query((db) =>
          Effect.sync(() => {
            db.run(sql`insert into tx_probe (value) values (${"queryrow"})`);
          }),
        ),
      );

      yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

      const rowCountWhileTransactionOpen = yield* Effect.sync(() => {
        const result = sqlite.query("select count(*) as count from tx_probe").get() as { readonly count: number };
        return Number(result.count);
      });

      expect(rowCountWhileTransactionOpen).toBe(1);

      yield* Deferred.succeed(releaseTransaction, undefined);
      const transactionExit = yield* Fiber.await(transactionFiber);
      const queryExit = yield* Fiber.await(queryFiber);

      expect(transactionExit._tag).toBe("Success");
      expect(queryExit._tag).toBe("Success");

      const rowCountAfterCommit = yield* Effect.sync(() => {
        const result = sqlite.query("select count(*) as count from tx_probe").get() as { readonly count: number };
        return Number(result.count);
      });

      expect(rowCountAfterCommit).toBe(2);
      yield* database.close();
    }),
  );

  it.effect("raw returns sqlite instance and close checkpoints WAL before closing", () =>
    Effect.gen(function* () {
      const { sqlite, exec, close } = createSqliteMock();
      const drizzleDb = {} as DrizzleDatabase;
      const database = yield* makeTestDatabase(sqlite, drizzleDb, "/tmp/migrations");

      const raw = yield* database.raw();
      yield* database.close();

      expect(raw).toBe(sqlite);
      expect(exec).toHaveBeenCalledWith("PRAGMA wal_checkpoint(TRUNCATE);");
      expect(close).toHaveBeenCalledTimes(1);
    }),
  );

  it.effect("migrate succeeds with repository migration files", () =>
    Effect.gen(function* () {
      const sqlite = new BunSQLiteDatabase(":memory:");
      const drizzleDb: DrizzleDatabase = drizzle(sqlite);
      const database = yield* makeTestDatabase(sqlite, drizzleDb, `${process.cwd()}/drizzle/migrations`);

      yield* database.migrate();

      const migratedTables = yield* Effect.sync(
        () =>
          sqlite
            .query("select name from sqlite_master where type='table' and name in ('runs', 'tool_health_checks', 'install_metadata')")
            .all() as Array<{ readonly name: string }>,
      );

      expect(migratedTables.map((table) => table.name).sort()).toEqual(["install_metadata", "runs", "tool_health_checks"]);

      yield* database.close();
    }),
  );

  it.effect("migrate maps migration failures to ConfigError", () =>
    Effect.gen(function* () {
      const sqlite = new BunSQLiteDatabase(":memory:");
      const drizzleDb: DrizzleDatabase = drizzle(sqlite);
      const database = yield* makeTestDatabase(sqlite, drizzleDb, `/tmp/missing-migrations-${Date.now()}`);

      const error = yield* Effect.flip(database.migrate());

      expect(error._tag).toBe("ConfigError");
      expect(error.message).toContain("Failed to run migrations");

      yield* database.close();
    }),
  );

  it.effect("DatabaseLiveLayer initializes and provides a migrated database", () =>
    Effect.gen(function* () {
      const dbPath = `/tmp/dev-live-layer-${Date.now()}.db`;
      const fileSystem = new FileSystemMock();
      const statePaths = makeStatePathsMock({
        stateDir: "/tmp/dev-live-layer-state",
        dbPath,
      });

      const dependencies = Layer.mergeAll(
        Layer.succeed(FileSystem, fileSystem),
        Layer.succeed(InstallPaths, makeInstallPathsMock({ installDir: process.cwd() })),
        Layer.succeed(StatePaths, statePaths),
      );
      const databaseLayer = Layer.provide(DatabaseLiveLayer, dependencies);

      const tableNames = yield* Effect.scoped(
        Effect.gen(function* () {
          const database = yield* Database;
          const raw = yield* database.raw();
          return yield* Effect.sync(
            () =>
              raw
                .query("select name from sqlite_master where type='table' and name in ('runs', 'tool_health_checks', 'install_metadata')")
                .all() as Array<{ readonly name: string }>,
          );
        }).pipe(Effect.provide(databaseLayer)),
      );

      expect(tableNames.map((table) => table.name).sort()).toEqual(["install_metadata", "runs", "tool_health_checks"]);
      expect(fileSystem.mkdirCalls[0]?.path).toBe("/tmp");
      expect(fileSystem.mkdirCalls[0]?.recursive).toBe(true);
    }),
  );

  it.effect("DatabaseLiveLayer fails clearly for non-repo installs", () =>
    Effect.gen(function* () {
      const fileSystem = new FileSystemMock();
      const databaseLayer = Layer.provide(
        DatabaseLiveLayer,
        Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(InstallPaths, makeInstallPathsMock({ installMode: "binary", installDir: "/tmp/dist", upgradeCapable: false })),
          Layer.succeed(StatePaths, makeStatePathsMock({ dbPath: "/tmp/dev-live-layer-binary.db" })),
        ),
      );

      const error = yield* Effect.flip(
        Effect.scoped(
          Effect.gen(function* () {
            return yield* Database;
          }).pipe(Effect.provide(databaseLayer)),
        ),
      );

      expect(error._tag).toBe("ConfigError");
      expect(error.message).toContain("Standalone binary distribution is not supported yet");
      expect(fileSystem.mkdirCalls).toEqual([]);
    }),
  );
});
