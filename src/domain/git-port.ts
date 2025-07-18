import { Context, type Effect } from "effect";

import type { GitError, ShellExecutionError } from "./errors";
import type { Repository } from "./models";

export interface Git {
  /**
   * Clone a repository to a destination path
   */
  cloneRepositoryToPath(
    repository: Repository,
    destinationPath: string,
  ): Effect.Effect<void, GitError | ShellExecutionError>;

  /**
   * Pull latest changes from the remote repository
   */
  pullLatestChanges(repositoryPath: string): Effect.Effect<void, GitError | ShellExecutionError>;

  /**
   * Check if a directory is a git repository
   */
  isGitRepository(path: string): Effect.Effect<boolean>;

  /**
   * Get the current git commit SHA
   */
  getCurrentCommitSha(repositoryPath?: string): Effect.Effect<string, GitError | ShellExecutionError>;

  /**
   * Get the remote origin URL of a repository
   */
  getRemoteOriginUrl(repositoryPath: string): Effect.Effect<string, GitError | ShellExecutionError>;
}

export class GitTag extends Context.Tag("Git")<GitTag, Git>() {}
