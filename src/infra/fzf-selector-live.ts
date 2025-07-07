import { Effect, Layer } from "effect";

import { unknownError, UnknownError } from "../domain/errors";
import { InteractiveSelectorPortTag, type InteractiveSelectorPort } from "../domain/interactive-selector-port";

// Factory function to create FzfSelector implementation
export const makeFzfSelector = (): InteractiveSelectorPort => ({
  selectFromList: (choices: string[]): Effect.Effect<string | null, UnknownError> =>
    Effect.gen(function* () {
      const directoryList = choices.join("\n") + "\n";

      const proc = yield* Effect.sync(() =>
        Bun.spawn(["fzf"], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        }),
      );

      // Write input to stdin
      if (proc.stdin) {
        const stdin = proc.stdin;
        yield* Effect.tryPromise({
          try: () => Promise.resolve(stdin.write(directoryList)),
          catch: (error) => unknownError(`Failed to write to fzf stdin: ${error}`),
        });

        yield* Effect.tryPromise({
          try: () => Promise.resolve(stdin.end()),
          catch: (error) => unknownError(`Failed to close fzf stdin: ${error}`),
        });
      }

      // Wait for process to complete
      const exitCode = yield* Effect.tryPromise({
        try: () => proc.exited,
        catch: (error) => unknownError(`Failed to wait for fzf process: ${error}`),
      });

      // Handle output
      if (exitCode === 0 && proc.stdout) {
        const output = yield* Effect.tryPromise({
          try: () => new Response(proc.stdout).text(),
          catch: (error) => unknownError(`Failed to read fzf output: ${error}`),
        });
        return output.trim();
      }

      // fzf returns 130 on ESC/Ctrl-C, which is cancellation, not an error
      return null;
    }).pipe(
      Effect.mapError((error) =>
        error instanceof UnknownError ? error : unknownError(`Fzf selection failed: ${error}`),
      ),
    ),
});

// Effect Layer for dependency injection
export const InteractiveSelectorPortLiveLayer = Layer.succeed(InteractiveSelectorPortTag, makeFzfSelector());
