import { Context, type Effect } from "effect";

import type { UnknownError } from "../errors";

export interface MiseInfo {
  version: string;
  runtimeVersions: Record<string, string>;
}

export interface MisePort {
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

export class MisePortTag extends Context.Tag("MisePort")<MisePortTag, MisePort>() {}
