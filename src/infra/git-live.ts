import { Effect, Layer } from "effect";

import { gitError, type GitError, type ShellExecutionError } from "../domain/errors";
import { GitTag, type Git } from "../domain/git-port";
import type { Repository } from "../domain/models";
import { ShellTag, type Shell } from "../domain/shell-port";

// Factory function to create Git implementation
export const makeGitLive = (shell: Shell): Git => ({
  cloneRepositoryToPath: (
    repository: Repository,
    destinationPath: string,
  ): Effect.Effect<void, GitError | ShellExecutionError> =>
    Effect.scoped(
      Effect.gen(function* () {
        // Add cleanup finalizer for failed clone operations
        yield* Effect.addFinalizer(() =>
          Effect.logDebug(`Git clone operation finalizer called for ${destinationPath}`),
        );

        const result = yield* shell.exec("git", ["clone", repository.cloneUrl, destinationPath]);

        if (result.exitCode !== 0) {
          return yield* Effect.fail(gitError(`Failed to clone repository: ${result.stderr}`));
        }

        return yield* Effect.void;
      }),
    ),

  pullLatestChanges: (repositoryPath: string): Effect.Effect<void, GitError | ShellExecutionError> =>
    shell.exec("git", ["pull"], { cwd: repositoryPath }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(gitError(`Failed to pull: ${result.stderr}`));
        }
        return Effect.void;
      }),
    ),

  isGitRepository: (path: string): Effect.Effect<boolean> =>
    shell.exec("git", ["rev-parse", "--git-dir"], { cwd: path }).pipe(
      Effect.map((result) => result.exitCode === 0),
      Effect.catchAll((_error) => Effect.succeed(false)),
    ),

  getCurrentCommitSha: (repositoryPath?: string): Effect.Effect<string, GitError | ShellExecutionError> =>
    shell.exec("git", ["rev-parse", "HEAD"], { cwd: repositoryPath }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(gitError(`Failed to get current commit SHA: ${result.stderr}`));
        }
        return Effect.succeed(result.stdout);
      }),
    ),

  getRemoteOriginUrl: (repositoryPath: string): Effect.Effect<string, GitError | ShellExecutionError> =>
    shell.exec("git", ["config", "--get", "remote.origin.url"], { cwd: repositoryPath }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(gitError(`Failed to get remote URL: ${result.stderr}`));
        }
        return Effect.succeed(result.stdout);
      }),
    ),
});

// Effect Layer for dependency injection
export const GitLiveLayer = Layer.effect(
  GitTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeGitLive(shell);
  }),
);
