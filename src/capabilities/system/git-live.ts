import { Effect, Layer } from "effect";

import { Git, type GitService } from "~/capabilities/system/git-port";
import { Shell, type ShellService } from "~/capabilities/system/shell-port";
import { GitError, type ShellExecutionError } from "~/core/errors";
import type { Repository } from "~/core/models";

// Effect Layer for dependency injection
export const GitLiveLayer = Layer.effect(
  Git,
  Effect.gen(function* () {
    const shell = yield* Shell;
    return {
      cloneRepositoryToPath: (repository: Repository, destinationPath: string): Effect.Effect<void, GitError | ShellExecutionError> =>
        Effect.scoped(
          Effect.gen(function* () {
            yield* Effect.addFinalizer(() => Effect.logDebug(`Git clone operation finalizer called for ${destinationPath}`));

            const result = yield* shell.exec("git", ["clone", repository.cloneUrl, destinationPath]);

            if (result.exitCode !== 0) {
              return yield* new GitError({ message: `Failed to clone repository: ${result.stderr}` });
            }
          }),
        ),
      pullLatestChanges: (repositoryPath: string): Effect.Effect<void, GitError | ShellExecutionError> =>
        shell.exec("git", ["pull"], { cwd: repositoryPath }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new GitError({ message: `Failed to pull: ${result.stderr}` });
            }
            return Effect.void;
          }),
        ),
      isGitRepository: (path: string): Effect.Effect<boolean> =>
        shell.exec("git", ["rev-parse", "--git-dir"], { cwd: path }).pipe(
          Effect.map((result) => result.exitCode === 0),
          Effect.orElseSucceed(() => false),
        ),
      getCurrentCommitSha: (repositoryPath?: string): Effect.Effect<string, GitError | ShellExecutionError> =>
        shell.exec("git", ["rev-parse", "HEAD"], { cwd: repositoryPath }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new GitError({ message: `Failed to get current commit SHA: ${result.stderr}` });
            }
            return Effect.succeed(result.stdout.trim());
          }),
        ),
      getCurrentCommitVersionInfo: (repositoryPath?: string) =>
        shell.exec("git", ["show", "-s", "--format=%cd%n%h", "--date=format:%Y%m%d%H%M%S", "HEAD"], { cwd: repositoryPath }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new GitError({ message: `Failed to get current commit version info: ${result.stderr}` });
            }

            const [timestamp, shortSha] = result.stdout.trim().split("\n");
            if (!timestamp || !shortSha) {
              return new GitError({ message: "Failed to parse current commit version info" });
            }

            return Effect.succeed({ timestamp, shortSha });
          }),
        ),
      getCurrentBranch: (repositoryPath: string): Effect.Effect<string, GitError | ShellExecutionError> =>
        shell.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: repositoryPath }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new GitError({ message: `Failed to get current branch: ${result.stderr}` });
            }
            return Effect.succeed(result.stdout.trim());
          }),
        ),
      getRemoteUrl: (repositoryPath: string, remoteName: string): Effect.Effect<string, GitError | ShellExecutionError> =>
        shell.exec("git", ["remote", "get-url", remoteName], { cwd: repositoryPath }).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new GitError({ message: `Failed to get remote URL: ${result.stderr}` });
            }
            return Effect.succeed(result.stdout.trim());
          }),
        ),
    } satisfies GitService;
  }),
);
