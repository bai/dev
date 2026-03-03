import { spawn } from "bun";
import { Duration, Effect, Layer } from "effect";

import { shellExecutionError, shellTimeoutError, type ShellExecutionError, type ShellTimeoutError } from "../domain/errors";
import { ShellTag, type Shell, type SpawnResult } from "../domain/shell-port";

const createShellSpanAttributes = (command: string, args: string[], cwd?: string): Record<string, string | number> => {
  if (cwd) {
    return {
      "shell.command": command,
      "shell.args.count": args.length,
      "shell.cwd": cwd,
    };
  }

  return {
    "shell.command": command,
    "shell.args.count": args.length,
  };
};

// Individual functions for each method
const exec = (command: string, args: string[] = [], options: { cwd?: string } = {}): Effect.Effect<SpawnResult, ShellExecutionError> =>
  Effect.tryPromise({
    try: async () => {
      const proc = spawn([command, ...args], {
        cwd: options.cwd,
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
      });

      const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

      const exitCode = await proc.exited;

      return {
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
    },
    catch: (error) => shellExecutionError(command, args, `Failed to execute command`, { cwd: options.cwd, underlyingError: error }),
  }).pipe(
    Effect.tap((result) => Effect.annotateCurrentSpan("shell.exit_code", result.exitCode)),
    Effect.withSpan("shell.exec", { attributes: createShellSpanAttributes(command, args, options.cwd) }),
  );

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
  }).pipe(
    Effect.tap((exitCode) => Effect.annotateCurrentSpan("shell.exit_code", exitCode)),
    Effect.withSpan("shell.exec_interactive", { attributes: createShellSpanAttributes(command, args, options.cwd) }),
  );

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
    Effect.catchTag("TimeoutException", () => shellTimeoutError(command, args, Duration.toMillis(timeout), options.cwd)),
  );

const execInteractiveWithTimeout = (
  command: string,
  args: string[] = [],
  timeout: Duration.Duration,
  options: { cwd?: string } = {},
): Effect.Effect<number, ShellExecutionError | ShellTimeoutError> =>
  execInteractive(command, args, options).pipe(
    Effect.timeout(timeout),
    Effect.catchTag("TimeoutException", () => shellTimeoutError(command, args, Duration.toMillis(timeout), options.cwd)),
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
export const ShellLiveLayer = Layer.effect(ShellTag, Effect.succeed(makeShellLive()));
