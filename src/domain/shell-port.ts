import { Context, type Effect } from "effect";

import type { ShellExecutionError } from "./errors";

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ShellPort {
  /**
   * Execute a command and return the result
   */
  exec(command: string, args?: string[], options?: { cwd?: string }): Effect.Effect<SpawnResult, ShellExecutionError>;

  /**
   * Execute a command interactively (inherit stdio)
   */
  execInteractive(
    command: string,
    args?: string[],
    options?: { cwd?: string },
  ): Effect.Effect<number, ShellExecutionError>;

  /**
   * Set the current working directory of the running process
   */
  setProcessCwd(path: string): Effect.Effect<void>;
}

export class ShellPortTag extends Context.Tag("ShellPort")<ShellPortTag, ShellPort>() {}
