import { Effect } from "effect";

import type { GitService } from "~/capabilities/system/git-port";
import { gitError } from "~/core/errors";
import type { Repository } from "~/core/models";

interface GitMockOverrides {
  readonly cloneRepositoryToPath?: GitService["cloneRepositoryToPath"];
  readonly pullLatestChanges?: GitService["pullLatestChanges"];
  readonly isGitRepository?: GitService["isGitRepository"];
  readonly getCurrentCommitSha?: GitService["getCurrentCommitSha"];
  readonly getCurrentBranch?: GitService["getCurrentBranch"];
  readonly getRemoteUrl?: GitService["getRemoteUrl"];
}

interface GitMockOptions {
  readonly gitRepositories?: Iterable<string>;
  readonly failingPullRepositories?: Iterable<string>;
  readonly defaultIsGitRepository?: boolean;
  readonly currentCommitSha?: string;
  readonly currentBranch?: string | null;
  readonly remoteUrl?: string | null;
  readonly overrides?: GitMockOverrides;
}

export class GitMock implements GitService {
  public readonly clonedRepos: Array<{ readonly repository: Repository; readonly destinationPath: string }> = [];
  public readonly pullCalls: string[] = [];
  public readonly isGitRepositoryCalls: string[] = [];
  public readonly getCurrentCommitShaCalls: Array<string | undefined> = [];
  public readonly getCurrentBranchCalls: string[] = [];
  public readonly getRemoteUrlCalls: string[] = [];

  public readonly gitRepositories: Set<string>;
  public readonly failingPullRepositories: Set<string>;
  public readonly defaultIsGitRepository: boolean;
  public currentCommitSha: string;
  public currentBranch: string | null;
  public remoteUrl: string | null;

  private readonly overrides: GitMockOverrides;

  constructor(options: GitMockOptions = {}) {
    this.gitRepositories = new Set(options.gitRepositories);
    this.failingPullRepositories = new Set(options.failingPullRepositories);
    this.defaultIsGitRepository = options.defaultIsGitRepository ?? true;
    this.currentCommitSha = options.currentCommitSha ?? "deadbeef";
    this.currentBranch = options.currentBranch ?? "main";
    this.remoteUrl = options.remoteUrl ?? "https://github.com/org/repo.git";
    this.overrides = options.overrides ?? {};
  }

  cloneRepositoryToPath(repository: Repository, destinationPath: string) {
    this.clonedRepos.push({ repository, destinationPath });

    if (this.overrides.cloneRepositoryToPath) {
      return this.overrides.cloneRepositoryToPath(repository, destinationPath);
    }

    return Effect.void;
  }

  pullLatestChanges(repositoryPath: string) {
    this.pullCalls.push(repositoryPath);

    if (this.overrides.pullLatestChanges) {
      return this.overrides.pullLatestChanges(repositoryPath);
    }

    if (this.failingPullRepositories.has(repositoryPath)) {
      return gitError("pull failed");
    }

    return Effect.void;
  }

  isGitRepository(path: string) {
    this.isGitRepositoryCalls.push(path);

    if (this.overrides.isGitRepository) {
      return this.overrides.isGitRepository(path);
    }

    if (this.gitRepositories.size === 0) {
      return Effect.succeed(this.defaultIsGitRepository);
    }

    return Effect.succeed(this.gitRepositories.has(path));
  }

  getCurrentCommitSha(repositoryPath?: string) {
    this.getCurrentCommitShaCalls.push(repositoryPath);

    if (this.overrides.getCurrentCommitSha) {
      return this.overrides.getCurrentCommitSha(repositoryPath);
    }

    return Effect.succeed(this.currentCommitSha);
  }

  getCurrentBranch(repositoryPath: string) {
    this.getCurrentBranchCalls.push(repositoryPath);

    if (this.overrides.getCurrentBranch) {
      return this.overrides.getCurrentBranch(repositoryPath);
    }

    if (this.currentBranch === null) {
      return gitError("not a git repository");
    }

    return Effect.succeed(this.currentBranch);
  }

  getRemoteUrl(repositoryPath: string, remoteName: string) {
    this.getRemoteUrlCalls.push(`${repositoryPath}:${remoteName}`);

    if (this.overrides.getRemoteUrl) {
      return this.overrides.getRemoteUrl(repositoryPath, remoteName);
    }

    if (this.remoteUrl === null) {
      return gitError("remote origin not found");
    }

    return Effect.succeed(this.remoteUrl);
  }
}
