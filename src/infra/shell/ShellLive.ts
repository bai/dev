import { spawn } from "bun";

import { Duration, Effect, Layer } from "effect";

import { unknownError, type UnknownError } from "../../domain/errors";
import { ShellService, type Shell, type SpawnResult } from "../../domain/ports/Shell";

export class ShellLive implements Shell {
  exec(command: string, args: string[] = [], options: { cwd?: string } = {}): Effect.Effect<SpawnResult, UnknownError> {
    return Effect.tryPromise({
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
  }

  execInteractive(
    command: string,
    args: string[] = [],
    options: { cwd?: string } = {},
  ): Effect.Effect<number, UnknownError> {
    return Effect.tryPromise({
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
  }

  changeDirectory(path: string): Effect.Effect<void> {
    return Effect.sync(() => {
      process.chdir(path);
    });
  }

  // Timeout wrapper methods for better resource management
  execWithTimeout(
    command: string,
    args: string[] = [],
    timeout: Duration.Duration,
    options: { cwd?: string } = {},
  ): Effect.Effect<SpawnResult, UnknownError> {
    return this.exec(command, args, options).pipe(
      Effect.timeout(timeout),
      Effect.catchTag("TimeoutException", () =>
        Effect.fail(unknownError(`Command ${command} timed out after ${Duration.toMillis(timeout)}ms`)),
      ),
    );
  }

  execInteractiveWithTimeout(
    command: string,
    args: string[] = [],
    timeout: Duration.Duration,
    options: { cwd?: string } = {},
  ): Effect.Effect<number, UnknownError> {
    return this.execInteractive(command, args, options).pipe(
      Effect.timeout(timeout),
      Effect.catchTag("TimeoutException", () =>
        Effect.fail(unknownError(`Interactive command ${command} timed out after ${Duration.toMillis(timeout)}ms`)),
      ),
    );
  }
}

// Effect Layer for dependency injection
export const ShellLiveLayer = Layer.succeed(ShellService, new ShellLive());
