import { eq } from "drizzle-orm";
import { Effect, Layer } from "effect";

import { Database, type DatabaseService } from "~/capabilities/persistence/database-port";
import type { DrizzleDatabase } from "~/capabilities/persistence/drizzle-types";
import { InstallIdentity, type InstallIdentityService } from "~/capabilities/persistence/install-identity-port";
import { configError } from "~/core/errors";

import { installMetadata } from "../../../drizzle/schema";

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

export const InstallIdentityLiveLayer = Layer.effect(
  InstallIdentity,
  Effect.gen(function* () {
    const database = yield* Database;
    return {
      getOrCreateInstallId: () =>
        database.query((db) =>
          Effect.gen(function* () {
            const existingRows = yield* selectInstallMetadataRow(db);
            const existingInstallId = existingRows[0]?.installId;
            if (existingInstallId) return existingInstallId;

            const newInstallId = yield* Effect.sync(() => Bun.randomUUIDv7());
            yield* insertInstallMetadataRow(db, newInstallId);

            const persistedRows = yield* selectInstallMetadataRow(db);
            const persistedInstallId = persistedRows[0]?.installId;
            if (!persistedInstallId) {
              return yield* Effect.fail(configError("Install identity row was not found after insert"));
            }
            return persistedInstallId;
          }),
        ),
    } satisfies InstallIdentityService;
  }),
);
