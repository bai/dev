import { Effect, Layer } from "effect";

import { gitError, unknownError } from "../../domain/errors";
import type { Repository } from "../../domain/models";
import { GitService, type Git } from "../../domain/ports/Git";
import { ShellService, type Shell } from "../../domain/ports/Shell";

export class GitLive implements Git {
  constructor(private shell: Shell) {}

  clone(
    repository: Repository,
    destinationPath: string,
  ): Effect.Effect<void, import("../../domain/errors").GitError | import("../../domain/errors").UnknownError> {
    return this.shell.exec("git", ["clone", repository.cloneUrl, destinationPath]).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(gitError(`Failed to clone repository: ${result.stderr}`));
        }
        return Effect.void;
      }),
    );
  }

  fetch(
    repositoryPath: string,
  ): Effect.Effect<void, import("../../domain/errors").GitError | import("../../domain/errors").UnknownError> {
    return this.shell.exec("git", ["fetch"], { cwd: repositoryPath }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(gitError(`Failed to fetch repository: ${result.stderr}`));
        }
        return Effect.void;
      }),
    );
  }

  isGitRepository(path: string): Effect.Effect<boolean> {
    return this.shell.exec("git", ["rev-parse", "--git-dir"], { cwd: path }).pipe(
      Effect.map((result) => result.exitCode === 0),
      Effect.catchAll(() => Effect.succeed(false)),
    );
  }

  getCurrentCommitSha(
    repositoryPath?: string,
  ): Effect.Effect<string, import("../../domain/errors").GitError | import("../../domain/errors").UnknownError> {
    return this.shell.exec("git", ["rev-parse", "HEAD"], { cwd: repositoryPath }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(gitError(`Failed to get current commit SHA: ${result.stderr}`));
        }
        return Effect.succeed(result.stdout.trim());
      }),
    );
  }

  getRemoteUrl(
    repositoryPath: string,
  ): Effect.Effect<string, import("../../domain/errors").GitError | import("../../domain/errors").UnknownError> {
    return this.shell.exec("git", ["config", "--get", "remote.origin.url"], { cwd: repositoryPath }).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return Effect.fail(gitError(`Failed to get remote URL: ${result.stderr}`));
        }
        return Effect.succeed(result.stdout.trim());
      }),
    );
  }
}

// Effect Layer for dependency injection
export const GitLiveLayer = Layer.effect(
  GitService,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    return new GitLive(shell);
  }),
);
