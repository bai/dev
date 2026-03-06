import { spawn } from "bun";
import { Effect, Layer } from "effect";

import { Shell, type ShellService, type SpawnResult } from "~/capabilities/system/shell-port";
import { shellExecutionError, type ShellExecutionError } from "~/core/errors";
import { annotateErrorTypeOnFailure } from "~/core/observability/error-type";

const createShellSpanAttributes = (command: string, args: string[], cwd?: string): Record<string, string | number> => ({
  "shell.command": command,
  "shell.args.count": args.length,
  ...(cwd ? { "shell.cwd": cwd } : {}),
});

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
    annotateErrorTypeOnFailure,
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
    annotateErrorTypeOnFailure,
    Effect.withSpan("shell.exec_interactive", { attributes: createShellSpanAttributes(command, args, options.cwd) }),
  );

const setProcessCwd = (path: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.chdir(path);
  });

export const ShellLive: ShellService = {
  exec,
  execInteractive,
  setProcessCwd,
};

// Effect Layer for dependency injection with proper resource management
export const ShellLiveLayer = Layer.succeed(Shell, ShellLive);
