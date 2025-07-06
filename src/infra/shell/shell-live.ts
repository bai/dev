import { spawn } from "bun";

import { Duration, Effect, Layer } from "effect";

import { unknownError, type UnknownError } from "../../domain/errors";
import { ShellPortTag, type ShellPort, type SpawnResult } from "../../domain/ports/shell-port";

// Individual functions for each method
const exec = (
  command: string,
  args: string[] = [],
  options: { cwd?: string } = {},
): Effect.Effect<SpawnResult, UnknownError> =>
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
    catch: (error) => unknownError(`Failed to execute command ${command}: ${error}`),
  });

const execInteractive = (
  command: string,
  args: string[] = [],
  options: { cwd?: string } = {},
): Effect.Effect<number, UnknownError> =>
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
    catch: (error) => unknownError(`Failed to execute interactive command ${command}: ${error}`),
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
): Effect.Effect<SpawnResult, UnknownError> =>
  exec(command, args, options).pipe(
    Effect.timeout(timeout),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(unknownError(`Command ${command} timed out after ${Duration.toMillis(timeout)}ms`)),
    ),
  );

const execInteractiveWithTimeout = (
  command: string,
  args: string[] = [],
  timeout: Duration.Duration,
  options: { cwd?: string } = {},
): Effect.Effect<number, UnknownError> =>
  execInteractive(command, args, options).pipe(
    Effect.timeout(timeout),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(unknownError(`Interactive command ${command} timed out after ${Duration.toMillis(timeout)}ms`)),
    ),
  );

// Plain object implementation
export const ShellLive: ShellPort & {
  execWithTimeout: typeof execWithTimeout;
  execInteractiveWithTimeout: typeof execInteractiveWithTimeout;
} = {
  exec,
  execInteractive,
  setProcessCwd,
  execWithTimeout,
  execInteractiveWithTimeout,
};

// Effect Layer for dependency injection
export const ShellPortLiveLayer = Layer.succeed(ShellPortTag, ShellLive);
