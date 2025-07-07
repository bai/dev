import { Context, type Effect } from "effect";

import type { ConfigError, UnknownError } from "./errors";
import type { CommandRun } from "./models";

export interface RunStorePort {
  /**
   * Record a new command run
   */
  record(run: Omit<CommandRun, "id" | "duration_ms">): Effect.Effect<string, ConfigError | UnknownError>;

  /**
   * Update a run record with completion details
   */
  complete(id: string, exitCode: number, finishedAt: Date): Effect.Effect<void, ConfigError | UnknownError>;

  /**
   * Prune old run records (keep only recent ones)
   */
  prune(keepDays: number): Effect.Effect<void, ConfigError | UnknownError>;

  /**
   * Get recent run statistics
   */
  getRecentRuns(limit: number): Effect.Effect<CommandRun[], ConfigError | UnknownError>;

  /**
   * Complete any incomplete command runs for graceful shutdown
   */
  completeIncompleteRuns(): Effect.Effect<void, ConfigError | UnknownError>;
}

export class RunStorePortTag extends Context.Tag("RunStorePort")<RunStorePortTag, RunStorePort>() {}
