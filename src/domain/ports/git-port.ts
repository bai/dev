import { Context, type Effect } from "effect";

import type { GitError, UnknownError } from "../errors";
import type { Repository } from "../models";

export interface GitPort {
  /**
   * Clone a repository to a destination path
   */
  cloneRepositoryToPath(repository: Repository, destinationPath: string): Effect.Effect<void, GitError | UnknownError>;

  /**
   * Fetch latest updates for a repository
   */
  fetchLatestUpdates(repositoryPath: string): Effect.Effect<void, GitError | UnknownError>;

  /**
   * Check if a directory is a git repository
   */
  isGitRepository(path: string): Effect.Effect<boolean>;

  /**
   * Get the current git commit SHA
   */
  getCurrentCommitSha(repositoryPath?: string): Effect.Effect<string, GitError | UnknownError>;

  /**
   * Get the remote origin URL of a repository
   */
  getRemoteOriginUrl(repositoryPath: string): Effect.Effect<string, GitError | UnknownError>;
}

export class GitPortTag extends Context.Tag("GitPort")<GitPortTag, GitPort>() {}
