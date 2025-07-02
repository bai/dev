import { Context, type Effect } from "effect";

import type { UnknownError } from "../errors";

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface Shell {
  /**
   * Execute a command and return the result
   */
  exec(command: string, args?: string[], options?: { cwd?: string }): Effect.Effect<SpawnResult, UnknownError>;

  /**
   * Execute a command interactively (inherit stdio)
   */
  execInteractive(command: string, args?: string[], options?: { cwd?: string }): Effect.Effect<number, UnknownError>;

  /**
   * Change the shell's working directory (used for shell integration)
   */
  changeDirectory(path: string): Effect.Effect<void>;
}

// Service tag for Effect Context system
export class ShellService extends Context.Tag("ShellService")<ShellService, Shell>() {}
