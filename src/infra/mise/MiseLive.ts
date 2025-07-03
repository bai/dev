import { Effect, Layer } from "effect";

import { unknownError, type UnknownError } from "../../domain/errors";
import { MiseService, type Mise, type MiseInfo } from "../../domain/ports/Mise";
import { ShellService, type Shell } from "../../domain/ports/Shell";

// Factory function to create Mise implementation
export const makeMiseLive = (shell: Shell): Mise => ({
  checkInstallation: (): Effect.Effect<MiseInfo, UnknownError> =>
    shell.exec("mise", ["--version"]).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(unknownError("Mise is not installed"));
        }

        const version = result.stdout.split(" ")[1] || "unknown";

        // Get runtime versions
        return shell.exec("mise", ["current"]).pipe(
          Effect.map((currentResult) => {
            const runtimeVersions: Record<string, string> = {};

            if (currentResult.exitCode === 0) {
              const lines = currentResult.stdout.split("\n");
              for (const line of lines) {
                const match = line.match(/^(\S+)\s+(\S+)/);
                if (match && match[1] && match[2]) {
                  runtimeVersions[match[1]] = match[2];
                }
              }
            }

            return {
              version,
              runtimeVersions,
            };
          }),
          Effect.catchAll(() =>
            Effect.succeed({
              version,
              runtimeVersions: {},
            }),
          ),
        );
      }),
    ),

  install: (): Effect.Effect<void, UnknownError> =>
    shell
      .exec("curl", [
        "-sSfL",
        "https://mise.run",
        "|",
        "sh",
      ])
      .pipe(
        Effect.flatMap((result) => {
          if (result.exitCode !== 0) {
            return Effect.fail(unknownError(`Failed to install mise: ${result.stderr}`));
          }
          return Effect.void;
        }),
      ),

  installTools: (cwd?: string): Effect.Effect<void, UnknownError> =>
    shell.exec("mise", ["install"], { cwd }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(unknownError(`Failed to install tools: ${result.stderr}`));
        }
        return Effect.void;
      }),
    ),

  runTask: (taskName: string, cwd?: string): Effect.Effect<void, UnknownError> =>
    shell.execInteractive("mise", ["run", taskName], { cwd }).pipe(
      Effect.flatMap((exitCode) => {
        if (exitCode !== 0) {
          return Effect.fail(unknownError(`Task '${taskName}' failed with exit code ${exitCode}`));
        }
        return Effect.void;
      }),
    ),

  getTasks: (cwd?: string): Effect.Effect<string[], UnknownError> =>
    shell.exec("mise", ["tasks", "--list"], { cwd }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(unknownError(`Failed to get tasks: ${result.stderr}`));
        }

        const tasks = result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"))
          .map((line) => line.split(/\s+/)[0])
          .filter((task): task is string => Boolean(task));

        return Effect.succeed(tasks);
      }),
    ),
});

// Effect Layer for dependency injection
export const MiseLiveLayer = Layer.effect(
  MiseService,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    return makeMiseLive(shell);
  }),
);
