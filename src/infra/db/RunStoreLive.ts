import fs from "fs";
import os from "os";
import path from "path";

import { Database } from "bun:sqlite";
import { desc, eq, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Effect, Layer } from "effect";

import { runs } from "../../../drizzle/schema";
import { configError, unknownError, type ConfigError, type UnknownError } from "../../domain/errors";
import type { CommandRun } from "../../domain/models";
import { RunStoreService, type RunStore } from "../../domain/ports/RunStore";

export class RunStoreLive implements RunStore {
  private db: ReturnType<typeof drizzle>;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const sqlite = new Database(dbPath);
    sqlite.exec("PRAGMA journal_mode = WAL;");
    this.db = drizzle(sqlite);

    // Run migrations
    this.runMigrations();
  }

  private runMigrations(): void {
    try {
      // Use migrations from the drizzle folder
      migrate(this.db, { migrationsFolder: path.join(__dirname, "../../../drizzle/migrations") });
    } catch (error) {
      // Note: console.warn is acceptable here as this is initialization code
      // outside the Effect context. In Effect context, we would use Effect.logWarning
      console.warn("Warning: Database migration failed:", error);
    }
  }

  record(run: Omit<CommandRun, "id" | "duration_ms">): Effect.Effect<string, ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const id = crypto.randomUUID();
        await this.db.insert(runs).values({
          id,
          cli_version: run.cli_version,
          command_name: run.command_name,
          arguments: run.arguments,
          cwd: run.cwd,
          started_at: run.started_at,
          finished_at: run.finished_at,
          exit_code: run.exit_code,
        });
        return id;
      },
      catch: (error) => configError(`Failed to record command run: ${error}`),
    });
  }

  complete(id: string, exitCode: number, finishedAt: Date): Effect.Effect<void, ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        await this.db
          .update(runs)
          .set({
            exit_code: exitCode,
            finished_at: finishedAt,
          })
          .where(eq(runs.id, id));
      },
      catch: (error) => configError(`Failed to complete command run: ${error}`),
    });
  }

  prune(keepDays: number): Effect.Effect<void, ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - keepDays);

        await this.db.delete(runs).where(lt(runs.started_at, cutoffDate));
      },
      catch: (error) => configError(`Failed to prune old runs: ${error}`),
    });
  }

  getRecentRuns(limit: number): Effect.Effect<CommandRun[], ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const result = await this.db.select().from(runs).orderBy(desc(runs.started_at)).limit(limit);

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

  // Use XDG-compliant state directory
  const stateDir = process.env.XDG_DATA_HOME
    ? path.join(process.env.XDG_DATA_HOME, "dev")
    : path.join(os.homedir(), ".local", "share", "dev");
  const dbPath = path.join(stateDir, "dev.db");

  return new RunStoreLive(dbPath);
});
