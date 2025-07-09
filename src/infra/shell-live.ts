import { spawn } from "bun";

import { Duration, Effect, Layer } from "effect";

import {
  shellExecutionError,
  shellTimeoutError,
} from "../domain/errors";
import type { ShellExecutionError, ShellTimeoutError } from "../domain/errors";
import { ShellTag } from "../domain/shell-port";
import type { Shell, SpawnResult } from "../domain/shell-port";

// Individual functions for each method
const exec = (
  command: string,
  args: string[] = [],
  options: { cwd?: string } = {},
): Effect.Effect<SpawnResult, ShellExecutionError> =>
  Effect.tryPromise({
    try: async () => {
      const proc = spawn([command, ...args], {
        cwd: options.cwd,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });

      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);

      const exitCode = await proc.exited;

      return {
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    },
    catch: (error) =>
      shellExecutionError(command, args, `Failed to execute command`, { cwd: options.cwd, underlyingError: error }),
  });

const execInteractive = (
  command: string,
  args: string[] = [],
  options: { cwd?: string } = {},
): Effect.Effect<number, ShellExecutionError> =>
  Effect.tryPromise({
    try: async () => {
      const proc = spawn([command, ...args], {
        cwd: options.cwd,
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
      });

      return await proc.exited;
    },
    catch: (error) =>
      shellExecutionError(command, args, `Failed to execute interactive command`, {
        cwd: options.cwd,
        underlyingError: error,
      }),
  });

const setProcessCwd = (path: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.chdir(path);
  });

// Timeout wrapper methods for better resource management
const execWithTimeout = (
  command: string,
  args: string[] = [],
  timeout: Duration.Duration,
  options: { cwd?: string } = {},
): Effect.Effect<SpawnResult, ShellExecutionError | ShellTimeoutError> =>
  exec(command, args, options).pipe(
    Effect.timeout(timeout),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(shellTimeoutError(command, args, Duration.toMillis(timeout), options.cwd)),
    ),
  );

const execInteractiveWithTimeout = (
  command: string,
  args: string[] = [],
  timeout: Duration.Duration,
  options: { cwd?: string } = {},
): Effect.Effect<number, ShellExecutionError | ShellTimeoutError> =>
  execInteractive(command, args, options).pipe(
    Effect.timeout(timeout),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(shellTimeoutError(command, args, Duration.toMillis(timeout), options.cwd)),
    ),
  );

// Factory function to create Shell implementation
export const makeShellLive = (): Shell & {
  execWithTimeout: typeof execWithTimeout;
  execInteractiveWithTimeout: typeof execInteractiveWithTimeout;
} => ({
  exec,
  execInteractive,
  setProcessCwd,
  execWithTimeout,
  execInteractiveWithTimeout,
});

// Effect Layer for dependency injection with proper resource management
export const ShellLiveLayer = Layer.effect(
  ShellTag,
  Effect.succeed(makeShellLive()),
);
