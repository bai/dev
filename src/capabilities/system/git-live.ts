import { Effect, Layer } from "effect";

import { GitTag, type Git } from "~/capabilities/system/git-port";
import { ShellTag, type Shell } from "~/capabilities/system/shell-port";
import { gitError, type GitError, type ShellExecutionError } from "~/core/errors";
import type { Repository } from "~/core/models";

// Effect Layer for dependency injection
export const GitLiveLayer = Layer.effect(
  GitTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    return {
      cloneRepositoryToPath: (repository: Repository, destinationPath: string): Effect.Effect<void, GitError | ShellExecutionError> =>
        Effect.scoped(
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() => Effect.logDebug(`Git clone operation finalizer called for ${destinationPath}`));

            const result = yield* shell.exec("git", ["clone", repository.cloneUrl, destinationPath]);

            if (result.exitCode !== 0) {
              return yield* gitError(`Failed to clone repository: ${result.stderr}`);
            }
          }),
        ),
      pullLatestChanges: (repositoryPath: string): Effect.Effect<void, GitError | ShellExecutionError> =>
        shell.exec("git", ["pull"], { cwd: repositoryPath }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return gitError(`Failed to pull: ${result.stderr}`);
            }
            return Effect.void;
          }),
        ),
      isGitRepository: (path: string): Effect.Effect<boolean> =>
        shell.exec("git", ["rev-parse", "--git-dir"], { cwd: path }).pipe(
          Effect.map((result) => result.exitCode === 0),
          Effect.catchAll(() => Effect.succeed(false)),
        ),
      getCurrentCommitSha: (repositoryPath?: string): Effect.Effect<string, GitError | ShellExecutionError> =>
        shell.exec("git", ["rev-parse", "HEAD"], { cwd: repositoryPath }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return gitError(`Failed to get current commit SHA: ${result.stderr}`);
            }
            return Effect.succeed(result.stdout.trim());
          }),
        ),
      getCurrentBranch: (repositoryPath: string): Effect.Effect<string, GitError | ShellExecutionError> =>
        shell.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repositoryPath }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return gitError(`Failed to get current branch: ${result.stderr}`);
            }
            return Effect.succeed(result.stdout.trim());
          }),
        ),
      getRemoteUrl: (repositoryPath: string, remoteName: string): Effect.Effect<string, GitError | ShellExecutionError> =>
        shell.exec("git", ["remote", "get-url", remoteName], { cwd: repositoryPath }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return gitError(`Failed to get remote URL: ${result.stderr}`);
            }
            return Effect.succeed(result.stdout.trim());
          }),
        ),
    } satisfies Git;
  }),
);
