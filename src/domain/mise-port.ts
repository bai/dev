import { Context, type Effect } from "effect";

import type { ShellExecutionError, UnknownError } from "./errors";

export interface MiseInfo {
  version: string;
  runtimeVersions: Record<string, string>;
}

export interface MisePort {
  /**
   * Check if mise is installed and get version info
   */
  checkInstallation(): Effect.Effect<MiseInfo, ShellExecutionError>;

  /**
   * Install mise if not present
   */
  install(): Effect.Effect<void, ShellExecutionError>;

  /**
   * Run mise install in the current directory
   */
  installTools(cwd?: string): Effect.Effect<void, ShellExecutionError>;

  /**
   * Run a task using mise
   */
  runTask(taskName: string, cwd?: string): Effect.Effect<void, ShellExecutionError>;

  /**
   * Get available tasks
   */
  getTasks(cwd?: string): Effect.Effect<string[], ShellExecutionError>;

  /**
   * Setup mise global configuration from current config
   */
  setupGlobalConfig(): Effect.Effect<void, UnknownError>;
}

export class MisePortTag extends Context.Tag("MisePort")<MisePortTag, MisePort>() {}
