import { Effect } from "effect";

import { devDir } from "~/lib/constants";

import { unknownError } from "../domain/errors";

/**
 * Gets the current Git commit SHA for the dev directory.
 *
 * @returns Effect that succeeds with the short (7-character) Git commit SHA, or falls back to "unknown"
 */
export const getCurrentGitCommitSha = (): Effect.Effect<string, never> => {
  return Effect.gen(function* () {
    const result = yield* Effect.tryPromise({
      try: () => {
        return new Promise<string>((resolve, reject) => {
          const proc = Bun.spawn(["git", "rev-parse", "--short=7", "HEAD"], {
            cwd: devDir,
            stdout: "pipe",
            stderr: "pipe",
          });

          proc.exited.then((exitCode) => {
            if (exitCode === 0 && proc.stdout) {
              const reader = proc.stdout.getReader();
              reader.read().then(({ value }) => {
                if (value) {
                  resolve(new TextDecoder().decode(value).trim());
                } else {
                  reject(new Error("No stdout"));
                }
              });
            } else {
              reject(new Error(`Git command failed with exit code ${exitCode}`));
            }
          });
        });
      },
      catch: (error) => unknownError(`Failed to get git commit SHA: ${error}`),
    });

    return result;
  }).pipe(Effect.catchAll(() => Effect.succeed("unknown")));
};
