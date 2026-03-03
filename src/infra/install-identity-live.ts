import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { installMetadata } from "../../drizzle/schema";
import { DatabaseTag, type Database } from "../domain/database-port";
import type { DrizzleDatabase } from "../domain/drizzle-types";
import { configError } from "../domain/errors";
import { InstallIdentityTag, type InstallIdentity } from "../domain/install-identity-port";

const INSTALL_METADATA_KEY = "singleton";

const selectInstallMetadataRow = (db: DrizzleDatabase) =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ installId: installMetadata.install_id })
        .from(installMetadata)
        .where(eq(installMetadata.key, INSTALL_METADATA_KEY))
        .limit(1),
    catch: (error) => configError(`Failed to query install metadata: ${error}`),
  });

const insertInstallMetadataRow = (db: DrizzleDatabase, installId: string) =>
  Effect.tryPromise({
    try: () =>
      db
        .insert(installMetadata)
        .values({
          key: INSTALL_METADATA_KEY,
          install_id: installId,
          created_at: new Date(),
        })
        .onConflictDoNothing({ target: installMetadata.key }),
    catch: (error) => configError(`Failed to insert install identity: ${error}`),
  });

export const makeInstallIdentityLive = (database: Database): InstallIdentity => ({
  getOrCreateInstallId: database.query((db) =>
    Effect.gen(function* () {
      const existingRows = yield* selectInstallMetadataRow(db);
      const existingInstallId = existingRows[0]?.installId;
      if (existingInstallId) return existingInstallId;

      yield* insertInstallMetadataRow(db, Bun.randomUUIDv7());

      const persistedRows = yield* selectInstallMetadataRow(db);
      const persistedInstallId = persistedRows[0]?.installId;
      if (!persistedInstallId) {
        return yield* Effect.fail(configError("Install identity row was not found after insert"));
      }
      return persistedInstallId;
    }),
  ),
});

export const InstallIdentityLiveLayer = Layer.effect(
  InstallIdentityTag,
  Effect.gen(function* () {
    const database = yield* DatabaseTag;
    return makeInstallIdentityLive(database);
  }),
);
