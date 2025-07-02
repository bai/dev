import os from "os";
import path from "path";

import { Database } from "bun:sqlite";
import { desc, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Effect, Layer } from "effect";

import { configError, unknownError } from "../../domain/errors";
import type { CommandRun } from "../../domain/models";
import { RunStoreService, type RunStore } from "../../domain/ports/RunStore";
import { runs } from "./schema";

export class RunStoreLive implements RunStore {
  private db: ReturnType<typeof drizzle>;

  constructor(dbPath: string) {
    const sqlite = new Database(dbPath);
    sqlite.exec("PRAGMA journal_mode = WAL;");
    this.db = drizzle(sqlite);
  }

  record(
    run: Omit<CommandRun, "id" | "duration_ms">,
  ): Effect.Effect<string, import("../../domain/errors").ConfigError | import("../../domain/errors").UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const id = crypto.randomUUID();
        await this.db.insert(runs).values({
          id,
          cli_version: run.cli_version,
          command_name: run.command_name,
          arguments: run.arguments,
          cwd: run.cwd,
          started_at: run.started_at.getTime(),
          finished_at: run.finished_at?.getTime(),
          exit_code: run.exit_code,
        });
        return id;
      },
      catch: (error) => configError(`Failed to record command run: ${error}`),
    });
  }

  complete(
    id: string,
    exitCode: number,
    finishedAt: Date,
  ): Effect.Effect<void, import("../../domain/errors").ConfigError | import("../../domain/errors").UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .update(runs)
          .set({
            exit_code: exitCode,
            finished_at: finishedAt.getTime(),
          })
          .where(eq(runs.id, id));
      },
      catch: (error) => configError(`Failed to complete command run: ${error}`),
    });
  }

  prune(
    keepDays: number,
  ): Effect.Effect<void, import("../../domain/errors").ConfigError | import("../../domain/errors").UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - keepDays);

        await this.db.delete(runs).where(lt(runs.started_at, cutoffDate.getTime()));
      },
      catch: (error) => configError(`Failed to prune old runs: ${error}`),
    });
  }

  getRecentRuns(
    limit: number,
  ): Effect.Effect<
    CommandRun[],
    import("../../domain/errors").ConfigError | import("../../domain/errors").UnknownError
  > {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db.select().from(runs).orderBy(runs.started_at.desc()).limit(limit);

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
    });
  }
}

// No-op implementation when storage is disabled
export class RunStoreNoOp implements RunStore {
  record(): Effect.Effect<string> {
    return Effect.succeed("noop");
  }

  complete(): Effect.Effect<void> {
    return Effect.void;
  }

  prune(): Effect.Effect<void> {
    return Effect.void;
  }

  getRecentRuns(): Effect.Effect<CommandRun[]> {
    return Effect.succeed([]);
  }
}

// Effect Layer for dependency injection
export const RunStoreLiveLayer = Layer.sync(RunStoreService, () => {
  // Check if storage is disabled
  if (process.env.DEV_CLI_STORE === "0") {
    return new RunStoreNoOp();
  }

  // Create database directory if it doesn't exist
  const stateDir = path.join(os.homedir(), ".dev", "state");
  const dbPath = path.join(stateDir, "dev.db");

  return new RunStoreLive(dbPath);
});
