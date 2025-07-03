import { Effect, Layer } from "effect";

import { gitError, unknownError, type GitError, type UnknownError } from "../../domain/errors";
import type { Repository } from "../../domain/models";
import { GitService, type Git } from "../../domain/ports/Git";
import { ShellService, type Shell } from "../../domain/ports/Shell";

// Factory function to create Git implementation
export const makeGitLive = (shell: Shell): Git => ({
  cloneRepositoryToPath: (
    repository: Repository,
    destinationPath: string,
  ): Effect.Effect<void, GitError | UnknownError> =>
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

  fetchLatestUpdates: (repositoryPath: string): Effect.Effect<void, GitError | UnknownError> =>
    shell.exec("git", ["fetch"], { cwd: repositoryPath }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(gitError(`Failed to fetch: ${result.stderr}`));
        }
        return Effect.void;
      }),
    ),

  isGitRepository: (path: string): Effect.Effect<boolean> =>
    shell.exec("git", ["rev-parse", "--git-dir"], { cwd: path }).pipe(
      Effect.map((result) => result.exitCode === 0),
      Effect.catchAll(() => Effect.succeed(false)),
    ),

  getCurrentCommitSha: (repositoryPath?: string): Effect.Effect<string, GitError | UnknownError> =>
    shell.exec("git", ["rev-parse", "HEAD"], { cwd: repositoryPath }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(gitError(`Failed to get current commit SHA: ${result.stderr}`));
        }
        return Effect.succeed(result.stdout);
      }),
    ),

  getRemoteOriginUrl: (repositoryPath: string): Effect.Effect<string, GitError | UnknownError> =>
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
  GitService,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    return makeGitLive(shell);
  }),
);
