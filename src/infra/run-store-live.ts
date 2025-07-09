import { desc, eq, isNull, lt } from "drizzle-orm";
import { Clock, Effect, Layer } from "effect";

import { runs } from "../../drizzle/schema";
import { DatabaseTag, type Database } from "../domain/database-port";
import { configError, type ConfigError, type UnknownError } from "../domain/errors";
import type { CommandRun } from "../domain/models";
import { RunStoreTag, type RunStore } from "../domain/run-store-port";

// Factory function that creates RunStore
export const makeRunStoreLive = (database: Database): RunStore => {
  // Individual functions implementing the service methods

  const record = (run: Omit<CommandRun, "id" | "duration_ms">): Effect.Effect<string, ConfigError | UnknownError> =>
    database
      .query((db) =>
        Effect.tryPromise({
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
        }),
      )
      .pipe(
        Effect.flatMap((result) =>
          Effect.fromNullable(result[0]).pipe(
            Effect.orElseFail(() => configError("Insert operation did not return a record")),
            Effect.map((insertedRun) => insertedRun.id),
          ),
        ),
      );

  const complete = (id: string, exitCode: number, finishedAt: Date): Effect.Effect<void, ConfigError | UnknownError> =>
    database.query((db) =>
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
      }),
    );

  const prune = (keepDays: number): Effect.Effect<void, ConfigError | UnknownError> =>
    Clock.currentTimeMillis.pipe(
      Effect.flatMap((currentTimeMs) => {
        const cutoffDate = new Date(currentTimeMs);
        cutoffDate.setDate(cutoffDate.getDate() - keepDays);

        return database.query((db) =>
          Effect.tryPromise({
            try: async () => {
              await db.delete(runs).where(lt(runs.started_at, cutoffDate));
            },
            catch: (error) => configError(`Failed to prune old runs: ${error}`),
          }),
        );
      }),
    );

  const getRecentRuns = (limit: number): Effect.Effect<CommandRun[], ConfigError | UnknownError> =>
    database.query((db) =>
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
      }),
    );

  const completeIncompleteRuns = (): Effect.Effect<void, ConfigError | UnknownError> =>
    Clock.currentTimeMillis.pipe(
      Effect.flatMap((currentTimeMs) => {
        const now = new Date(currentTimeMs);

        return database.query((db) =>
          Effect.tryPromise({
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
          }),
        );
      }),
    );

  return {
    record,
    complete,
    prune,
    getRecentRuns,
    completeIncompleteRuns,
  };
};

// Effect Layer for dependency injection
export const RunStoreLiveLayer = Layer.scoped(
  RunStoreTag,
  Effect.gen(function* () {
    const database = yield* DatabaseTag;

    // Create the service
    const runStore = makeRunStoreLive(database);

    // Note: Graceful shutdown of incomplete runs is handled by the main application
    // in index.ts to ensure proper ordering with database shutdown

    return runStore;
  }),
);
