import { desc, eq, isNull, lt } from "drizzle-orm";
import { Clock, Effect, Layer } from "effect";

import { Database } from "~/capabilities/persistence/database-port";
import { RunStore, type RunStoreService } from "~/capabilities/persistence/run-store-port";
import { ConfigError, type UnknownError } from "~/core/errors";
import type { CommandRun } from "~/core/models";
import { annotateErrorTypeOnFailure } from "~/core/observability/error-type";

import { runs } from "../../../drizzle/schema";

const toDomainRun = (row: typeof runs.$inferSelect): CommandRun => ({
  id: row.id,
  cliVersion: row.cli_version,
  commandName: row.command_name,
  arguments: row.arguments ?? undefined,
  exitCode: row.exit_code ?? undefined,
  cwd: row.cwd,
  startedAt: new Date(row.started_at),
  finishedAt: row.finished_at ? new Date(row.finished_at) : undefined,
  durationMs: row.duration_ms ?? undefined,
});

// Effect Layer for dependency injection
export const RunStoreLiveLayer = Layer.scoped(
  RunStore,
  Effect.gen(function* () {
    const database = yield* Database;
    return {
      record: (run: Omit<CommandRun, "id" | "durationMs">): Effect.Effect<string, ConfigError | UnknownError> =>
        database
          .query((db) =>
            Effect.gen(function* () {
              const runId = yield* Effect.sync(() => Bun.randomUUIDv7());
              return yield* Effect.tryPromise({
                try: async () => {
                  return await db
                    .insert(runs)
                    .values({
                      id: runId,
                      cli_version: run.cliVersion,
                      command_name: run.commandName,
                      arguments: run.arguments,
                      cwd: run.cwd,
                      started_at: run.startedAt,
                      finished_at: run.finishedAt,
                      exit_code: run.exitCode,
                    })
                    .returning({ id: runs.id });
                },
                catch: (error) => new ConfigError({ message: `Failed to record command run: ${error}` }),
              });
            }),
          )
          .pipe(
            Effect.flatMap((result) =>
              Effect.fromNullable(result[0]).pipe(
                Effect.orElseFail(() => new ConfigError({ message: "Insert operation did not return a record" })),
                Effect.map((insertedRun) => insertedRun.id),
              ),
            ),
            annotateErrorTypeOnFailure,
            Effect.withSpan("run_store.record", { attributes: { "run.command": run.commandName } }),
          ),
      complete: (id: string, exitCode: number, finishedAt: Date): Effect.Effect<void, ConfigError | UnknownError> =>
        database
          .query((db) =>
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
              catch: (error) => new ConfigError({ message: `Failed to complete command run: ${error}` }),
            }),
          )
          .pipe(
            annotateErrorTypeOnFailure,
            Effect.withSpan("run_store.complete", { attributes: { "run.id": id, "run.exit_code": exitCode } }),
          ),
      prune: (keepDays: number): Effect.Effect<void, ConfigError | UnknownError> =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((currentTimeMs) => {
            const cutoffDate = new Date(currentTimeMs);
            cutoffDate.setDate(cutoffDate.getDate() - keepDays);

            return database.query((db) =>
              Effect.tryPromise({
                try: async () => {
                  await db.delete(runs).where(lt(runs.started_at, cutoffDate));
                },
                catch: (error) => new ConfigError({ message: `Failed to prune old runs: ${error}` }),
              }),
            );
          }),
          annotateErrorTypeOnFailure,
          Effect.withSpan("run_store.prune", { attributes: { "run_store.keep_days": keepDays } }),
        ),
      getRecentRuns: (limit: number): Effect.Effect<CommandRun[], ConfigError | UnknownError> =>
        database
          .query((db) =>
            Effect.tryPromise({
              try: async () => {
                const result = await db.select().from(runs).orderBy(desc(runs.started_at)).limit(limit);
                return result.map(toDomainRun);
              },
              catch: (error) => new ConfigError({ message: `Failed to get recent runs: ${error}` }),
            }),
          )
          .pipe(annotateErrorTypeOnFailure, Effect.withSpan("run_store.get_recent", { attributes: { "run_store.limit": limit } })),
      completeIncompleteRuns: (): Effect.Effect<void, ConfigError | UnknownError> =>
        Clock.currentTimeMillis.pipe(
          Effect.flatMap((currentTimeMs) => {
            const now = new Date(currentTimeMs);

            return database.query((db) =>
              Effect.tryPromise({
                try: async () => {
                  await db
                    .update(runs)
                    .set({
                      exit_code: 130,
                      finished_at: now,
                    })
                    .where(isNull(runs.finished_at));
                },
                catch: (error) => new ConfigError({ message: `Failed to complete incomplete runs: ${error}` }),
              }),
            );
          }),
          annotateErrorTypeOnFailure,
          Effect.withSpan("run_store.complete_incomplete"),
        ),
    } satisfies RunStoreService;
  }),
);
