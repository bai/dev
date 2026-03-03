import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { installMetadata } from "../../drizzle/schema";
import { DatabaseTag, type Database } from "../domain/database-port";
import type { DrizzleDatabase } from "../domain/drizzle-types";
import { configError } from "../domain/errors";
import { InstallIdentityTag, type InstallIdentity } from "../domain/install-identity-port";

const INSTALL_METADATA_KEY = "singleton";

const selectInstallMetadataRow = (db: DrizzleDatabase) =>
  db.select({ installId: installMetadata.install_id }).from(installMetadata).where(eq(installMetadata.key, INSTALL_METADATA_KEY)).limit(1);

export const makeInstallIdentityLive = (database: Database): InstallIdentity => ({
  getOrCreateInstallId: database.query((db) =>
    Effect.tryPromise({
      try: async () => {
        const existingRows = await selectInstallMetadataRow(db);
        const existingInstallId = existingRows[0]?.installId;
        if (existingInstallId) {
          return existingInstallId;
        }

        const installId = Bun.randomUUIDv7();
        await db
          .insert(installMetadata)
          .values({
            key: INSTALL_METADATA_KEY,
            install_id: installId,
            created_at: new Date(),
          })
          .onConflictDoNothing({ target: installMetadata.key });

        const persistedRows = await selectInstallMetadataRow(db);
        const persistedInstallId = persistedRows[0]?.installId;
        if (!persistedInstallId) {
          throw new Error("Install identity row was not found after insert");
        }

        return persistedInstallId;
      },
      catch: (error) => configError(`Failed to get or create install identity: ${error}`),
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
