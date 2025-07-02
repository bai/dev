import { Context, type Effect } from "effect";

import type { GitError, UnknownError } from "../errors";
import type { Repository } from "../models";

export interface Git {
  /**
   * Clone a repository to a destination path
   */
  clone(repository: Repository, destinationPath: string): Effect.Effect<void, GitError | UnknownError>;

  /**
   * Fetch updates for a repository
   */
  fetch(repositoryPath: string): Effect.Effect<void, GitError | UnknownError>;

  /**
   * Check if a directory is a git repository
   */
  isGitRepository(path: string): Effect.Effect<boolean>;

  /**
   * Get the current git commit SHA
   */
  getCurrentCommitSha(repositoryPath?: string): Effect.Effect<string, GitError | UnknownError>;

  /**
   * Get the remote URL of a repository
   */
  getRemoteUrl(repositoryPath: string): Effect.Effect<string, GitError | UnknownError>;
}

// Service tag for Effect Context system
export class GitService extends Context.Tag("GitService")<GitService, Git>() {}
