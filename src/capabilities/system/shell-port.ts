import { Effect } from "effect";

import type { ShellExecutionError } from "~/core/errors";

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class Shell extends Effect.Tag("Shell")<
  Shell,
  {
    /**
     * Execute a command and return the result
     */
    exec(command: string, args?: string[], options?: { cwd?: string }): Effect.Effect<SpawnResult, ShellExecutionError>;

    /**
     * Execute a command interactively (inherit stdio)
     */
    execInteractive(command: string, args?: string[], options?: { cwd?: string }): Effect.Effect<number, ShellExecutionError>;

    /**
     * Set the current working directory of the running process
     */
    setProcessCwd(path: string): Effect.Effect<void>;
  }
>() {}

export type ShellService = (typeof Shell)["Service"];
