import { Context, type Effect } from "effect";

import type { UnknownError } from "../errors";

export interface MiseInfo {
  version: string;
  runtimeVersions: Record<string, string>;
}

export interface Mise {
  /**
   * Check if mise is installed and get version info
   */
  checkInstallation(): Effect.Effect<MiseInfo, UnknownError>;

  /**
   * Install mise if not present
   */
  install(): Effect.Effect<void, UnknownError>;

  /**
   * Run mise install in the current directory
   */
  installTools(cwd?: string): Effect.Effect<void, UnknownError>;

  /**
   * Run a task using mise
   */
  runTask(taskName: string, cwd?: string): Effect.Effect<void, UnknownError>;

  /**
   * Get available tasks
   */
  getTasks(cwd?: string): Effect.Effect<string[], UnknownError>;
}

// Service tag for Effect Context system
export class MiseService extends Context.Tag("MiseService")<MiseService, Mise>() {}
