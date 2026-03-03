import { Database as BunSQLiteDatabase } from "bun:sqlite";

import { it } from "@effect/vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { installMetadata } from "../../drizzle/schema";
import type { Database } from "../domain/database-port";
import type { DrizzleDatabase } from "../domain/drizzle-types";
import { makeInstallIdentityLive } from "./install-identity-live";

const CREATE_INSTALL_METADATA_TABLE_SQL = `
CREATE TABLE install_metadata (
  key text PRIMARY KEY NOT NULL,
  install_id text NOT NULL,
  created_at integer NOT NULL
);
`;

interface TestDatabase {
  readonly database: Database;
  readonly sqlite: BunSQLiteDatabase;
}

const makeTestDatabase = (): TestDatabase => {
  const sqlite = new BunSQLiteDatabase(":memory:");
  sqlite.exec(CREATE_INSTALL_METADATA_TABLE_SQL);

  const drizzleDb: DrizzleDatabase = drizzle(sqlite);
  const database: Database = {
    query: (fn) => fn(drizzleDb),
    transaction: (fn) => fn(drizzleDb),
    raw: () => Effect.succeed(sqlite),
    migrate: () => Effect.void,
  };

  return { database, sqlite };
};

const withTestDatabase = <A>(run: (database: Database) => Effect.Effect<A>) =>
  Effect.gen(function* () {
    const { database, sqlite } = makeTestDatabase();
    return yield* run(database).pipe(Effect.orDie, Effect.ensuring(Effect.sync(() => sqlite.close()).pipe(Effect.orDie)));
  });

const selectSingletonRows = (database: Database) =>
  database
    .query((db) =>
      Effect.tryPromise({
        try: () => db.select().from(installMetadata).where(eq(installMetadata.key, "singleton")).limit(1),
        catch: (error) => new Error(`Failed to query install metadata rows: ${String(error)}`),
      }).pipe(Effect.orDie),
    )
    .pipe(Effect.orDie);

describe("install-identity-live", () => {
  it.effect("generates an install id once and reuses it for future calls", () =>
    withTestDatabase((database) =>
      Effect.gen(function* () {
        const installIdentity = makeInstallIdentityLive(database);

        const firstInstallId = yield* installIdentity.getOrCreateInstallId.pipe(Effect.orDie);
        const secondInstallId = yield* installIdentity.getOrCreateInstallId.pipe(Effect.orDie);
        const persistedRows = yield* selectSingletonRows(database);

        expect(firstInstallId).toBe(secondInstallId);
        expect(firstInstallId.length).toBe(36);
        expect(firstInstallId[14]).toBe("7");
        expect(persistedRows).toHaveLength(1);
        expect(persistedRows[0]?.install_id).toBe(firstInstallId);
      }),
    ),
  );

  it.effect("returns pre-existing persisted install id when one already exists", () =>
    withTestDatabase((database) =>
      Effect.gen(function* () {
        const expectedInstallId = "0196ed78-467a-7f2f-bf6b-95e73fd43b8d";
        yield* database
          .query((db) =>
            Effect.tryPromise({
              try: () =>
                db.insert(installMetadata).values({
                  key: "singleton",
                  install_id: expectedInstallId,
                  created_at: new Date(),
                }),
              catch: (error) => new Error(`Failed to insert existing install id row: ${String(error)}`),
            }).pipe(Effect.orDie),
          )
          .pipe(Effect.orDie);

        const installIdentity = makeInstallIdentityLive(database);
        const resolvedInstallId = yield* installIdentity.getOrCreateInstallId.pipe(Effect.orDie);
        const persistedRows = yield* selectSingletonRows(database);

        expect(resolvedInstallId).toBe(expectedInstallId);
        expect(persistedRows).toHaveLength(1);
        expect(persistedRows[0]?.install_id).toBe(expectedInstallId);
      }),
    ),
  );
});
