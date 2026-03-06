import { Effect } from "effect";

import type { GitError, ShellExecutionError } from "~/core/errors";
import type { Repository } from "~/core/models";

export class GitTag extends Effect.Tag("Git")<
  GitTag,
  {
    /**
     * Clone a repository to a destination path
     */
    cloneRepositoryToPath(repository: Repository, destinationPath: string): Effect.Effect<void, GitError | ShellExecutionError>;

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
     * Get the current branch name of a repository
     */
    getCurrentBranch(repositoryPath: string): Effect.Effect<string, GitError | ShellExecutionError>;

    /**
     * Get the remote URL of a repository
     */
    getRemoteUrl(repositoryPath: string, remoteName: string): Effect.Effect<string, GitError | ShellExecutionError>;
  }
>() {}

export type Git = (typeof GitTag)["Service"];
