import { it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { describe, expect } from "vitest";

import { unknownError } from "../domain/errors";
import { FileSystemTag, type FileSystem } from "../domain/file-system-port";
import { GitTag, type Git } from "../domain/git-port";
import type { Config, GitProvider, Repository } from "../domain/models";
import { PathServiceTag, type PathService } from "../domain/path-service";
import { RepoProviderTag, type RepoProvider } from "../domain/repo-provider-port";
import { RepositoryServiceTag, type RepositoryService } from "../domain/repository-service";
import { cloneCommand } from "./clone-command";
import { ShellIntegrationTag, type ShellIntegration } from "./shell-integration-service";

describe("clone-command", () => {
  // Mock implementations
  class MockFileSystem implements FileSystem {
    public existingPaths = new Set<string>();

    exists(path: string): Effect.Effect<boolean, never, never> {
      return Effect.succeed(this.existingPaths.has(path));
    }

    writeFile(_path: string, _content: string): Effect.Effect<void, never, never> {
      return Effect.succeed(undefined);
    }

    readFile(_path: string): Effect.Effect<string, never, never> {
      return Effect.succeed("");
    }

    mkdir(_path: string, _recursive?: boolean): Effect.Effect<void, never, never> {
      return Effect.succeed(undefined);
    }

    findDirectoriesGlob(_basePath: string, _pattern: string): Effect.Effect<string[], never, never> {
      return Effect.succeed([]);
    }

    getCwd(): Effect.Effect<string, never, never> {
      return Effect.succeed("/home/user/dev");
    }

    resolvePath(path: string): string {
      return path;
    }
  }

  class MockGit implements Git {
    public clonedRepos: Array<{ repository: Repository; destinationPath: string }> = [];

    cloneRepositoryToPath(repository: Repository, destinationPath: string): Effect.Effect<void, never, never> {
      this.clonedRepos.push({ repository, destinationPath });
      return Effect.succeed(undefined);
    }

    pullLatestChanges(_repositoryPath: string): Effect.Effect<void, never, never> {
      return Effect.succeed(undefined);
    }

    isGitRepository(_path: string): Effect.Effect<boolean, never, never> {
      return Effect.succeed(true);
    }

    getCurrentCommitSha(_repositoryPath?: string): Effect.Effect<string, never, never> {
      return Effect.succeed("abc123");
    }

    getRemoteOriginUrl(_repositoryPath: string): Effect.Effect<string, never, never> {
      return Effect.succeed("https://github.com/org/repo.git");
    }
  }

  class MockRepoProvider implements RepoProvider {
    constructor(
      private readonly defaultOrg = "default-org",
      private readonly provider: GitProvider = { name: "github", baseUrl: "https://github.com" },
    ) {}

    resolveRepository(name: string, org?: string): Effect.Effect<Repository, never, never> {
      const repository: Repository = {
        name,
        organization: org || this.defaultOrg,
        provider: this.provider,
        cloneUrl: `${this.provider.baseUrl}/${org || this.defaultOrg}/${name}.git`,
      };
      return Effect.succeed(repository);
    }

    getDefaultOrg(): string {
      return this.defaultOrg;
    }

    getProvider(): GitProvider {
      return this.provider;
    }
  }

  class MockPathService implements PathService {
    homeDir = "/home/user";
    baseSearchPath = "/home/user/dev";
    devDir = "/home/user/.dev";
    configDir = "/home/user/.config/dev";
    configPath = "/home/user/.config/dev/config.json";
    dataDir = "/home/user/.local/share/dev";
    dbPath = "/home/user/.local/share/dev/dev.db";
    cacheDir = "/home/user/.cache/dev";

    getBasePath(_config: Config): string {
      return this.baseSearchPath;
    }
  }

  class MockRepositoryService implements RepositoryService {
    parseRepoUrlToPath(repoUrl: string): Effect.Effect<string, never, never> {
      // Simple mock implementation - extract org/repo from URL
      const match = repoUrl.match(/([^/]+)\/([^/]+)\.git$/);
      if (match && match[1] && match[2]) {
        return Effect.succeed(`/home/user/dev/github.com/${match[1]}/${match[2]}`);
      }
      return Effect.succeed("/home/user/dev/github.com/org/repo");
    }

    expandToFullGitUrl(
      repoInput: string,
      defaultOrg: string,
      _orgToProvider?: Record<string, "github" | "gitlab">,
      _forceProvider?: "github" | "gitlab",
    ): Effect.Effect<string, never, never> {
      if (repoInput.includes("/")) {
        return Effect.succeed(`https://github.com/${repoInput}`);
      }
      return Effect.succeed(`https://github.com/${defaultOrg}/${repoInput}`);
    }
  }

  class MockShellIntegration implements ShellIntegration {
    public changedDirectories: string[] = [];

    changeDirectory(path: string): Effect.Effect<void, never, never> {
      this.changedDirectories.push(path);
      return Effect.succeed(undefined);
    }
  }

  describe("repository cloning", () => {
    it.effect("clones repository with org/repo format", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, fileSystem),
          Layer.succeed(GitTag, git),
          Layer.succeed(RepoProviderTag, new MockRepoProvider()),
          Layer.succeed(PathServiceTag, new MockPathService()),
          Layer.succeed(RepositoryServiceTag, new MockRepositoryService()),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        // Parse args and run command
        const args = { repo: "myorg/myrepo" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos).toHaveLength(1);
        expect(git.clonedRepos[0]?.repository.name).toBe("myrepo");
        expect(git.clonedRepos[0]?.repository.organization).toBe("myorg");
        expect(git.clonedRepos[0]?.destinationPath).toBe("/home/user/dev/github.com/myorg/myrepo");
        expect(shellIntegration.changedDirectories).toEqual(["github.com/myorg/myrepo"]);
      }),
    );

    it.effect("clones repository with just repo name using default org", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, fileSystem),
          Layer.succeed(GitTag, git),
          Layer.succeed(RepoProviderTag, new MockRepoProvider("default-org")),
          Layer.succeed(PathServiceTag, new MockPathService()),
          Layer.succeed(RepositoryServiceTag, new MockRepositoryService()),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const args = { repo: "myrepo" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos).toHaveLength(1);
        expect(git.clonedRepos[0]?.repository.name).toBe("myrepo");
        expect(git.clonedRepos[0]?.repository.organization).toBe("default-org");
        expect(shellIntegration.changedDirectories).toEqual(["github.com/default-org/myrepo"]);
      }),
    );

    it.effect("changes to existing directory without cloning", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        fileSystem.existingPaths.add("/home/user/dev/github.com/myorg/myrepo");

        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, fileSystem),
          Layer.succeed(GitTag, git),
          Layer.succeed(RepoProviderTag, new MockRepoProvider()),
          Layer.succeed(PathServiceTag, new MockPathService()),
          Layer.succeed(RepositoryServiceTag, new MockRepositoryService()),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const args = { repo: "myorg/myrepo" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos).toHaveLength(0); // No cloning happened
        expect(shellIntegration.changedDirectories).toEqual(["github.com/myorg/myrepo"]);
      }),
    );
  });

  describe("error handling", () => {
    it.effect("fails when repository name is empty", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, fileSystem),
          Layer.succeed(GitTag, git),
          Layer.succeed(RepoProviderTag, new MockRepoProvider()),
          Layer.succeed(PathServiceTag, new MockPathService()),
          Layer.succeed(RepositoryServiceTag, new MockRepositoryService()),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const args = { repo: "" };
        const command = cloneCommand.handler(args);

        const result = yield* Effect.exit(command.pipe(Effect.provide(testLayer)));

        expect(Exit.isFailure(result)).toBe(true);
        expect(git.clonedRepos).toHaveLength(0);
        expect(shellIntegration.changedDirectories).toHaveLength(0);
      }),
    );

    it.effect("handles repository resolution errors", () =>
      Effect.gen(function* () {
        class FailingRepoProvider extends MockRepoProvider {
          resolveRepository(_name: string, _org?: string): Effect.Effect<Repository, never, never> {
            return Effect.fail(unknownError("Failed to resolve repository")) as unknown as Effect.Effect<
              Repository,
              never,
              never
            >;
          }
        }

        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, fileSystem),
          Layer.succeed(GitTag, git),
          Layer.succeed(RepoProviderTag, new FailingRepoProvider()),
          Layer.succeed(PathServiceTag, new MockPathService()),
          Layer.succeed(RepositoryServiceTag, new MockRepositoryService()),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const args = { repo: "myorg/myrepo" };
        const command = cloneCommand.handler(args);

        const result = yield* Effect.exit(command.pipe(Effect.provide(testLayer)));

        expect(Exit.isFailure(result)).toBe(true);
        expect(git.clonedRepos).toHaveLength(0);
      }),
    );
  });

  describe("provider handling", () => {
    it.effect("clones from GitHub provider", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();
        const githubProvider: GitProvider = { name: "github", baseUrl: "https://github.com" };

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, fileSystem),
          Layer.succeed(GitTag, git),
          Layer.succeed(RepoProviderTag, new MockRepoProvider("github-org", githubProvider)),
          Layer.succeed(PathServiceTag, new MockPathService()),
          Layer.succeed(RepositoryServiceTag, new MockRepositoryService()),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const args = { repo: "github-org/github-repo" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos[0]?.repository.provider.name).toBe("github");
        expect(git.clonedRepos[0]?.repository.cloneUrl).toBe("https://github.com/github-org/github-repo.git");
      }),
    );

    it.effect("clones from GitLab provider", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();
        const gitlabProvider: GitProvider = { name: "gitlab", baseUrl: "https://gitlab.com" };

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, fileSystem),
          Layer.succeed(GitTag, git),
          Layer.succeed(RepoProviderTag, new MockRepoProvider("gitlab-org", gitlabProvider)),
          Layer.succeed(PathServiceTag, new MockPathService()),
          Layer.succeed(RepositoryServiceTag, new MockRepositoryService()),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const args = { repo: "gitlab-org/gitlab-repo" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos[0]?.repository.provider.name).toBe("gitlab");
        expect(git.clonedRepos[0]?.repository.cloneUrl).toBe("https://gitlab.com/gitlab-org/gitlab-repo.git");
      }),
    );
  });

  describe("path handling", () => {
    it.effect("calculates relative path correctly", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        class CustomPathService extends MockPathService {
          baseSearchPath = "/Users/developer/projects";
        }

        class CustomRepositoryService extends MockRepositoryService {
          parseRepoUrlToPath(repoUrl: string): Effect.Effect<string, never, never> {
            const match = repoUrl.match(/([^/]+)\/([^/]+)\.git$/);
            if (match && match[1] && match[2]) {
              return Effect.succeed(`/Users/developer/projects/github.com/${match[1]}/${match[2]}`);
            }
            return Effect.succeed("/Users/developer/projects/github.com/org/repo");
          }
        }

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, fileSystem),
          Layer.succeed(GitTag, git),
          Layer.succeed(RepoProviderTag, new MockRepoProvider()),
          Layer.succeed(PathServiceTag, new CustomPathService()),
          Layer.succeed(RepositoryServiceTag, new CustomRepositoryService()),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const args = { repo: "test-org/test-repo" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos[0]?.destinationPath).toBe("/Users/developer/projects/github.com/test-org/test-repo");
        expect(shellIntegration.changedDirectories).toEqual(["github.com/test-org/test-repo"]);
      }),
    );

    it.effect("handles repositories with special characters", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, fileSystem),
          Layer.succeed(GitTag, git),
          Layer.succeed(RepoProviderTag, new MockRepoProvider()),
          Layer.succeed(PathServiceTag, new MockPathService()),
          Layer.succeed(RepositoryServiceTag, new MockRepositoryService()),
          Layer.succeed(ShellIntegrationTag, shellIntegration),
        );

        const args = { repo: "my-org/my-repo-2.0" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos[0]?.repository.name).toBe("my-repo-2.0");
        expect(git.clonedRepos[0]?.repository.organization).toBe("my-org");
      }),
    );
  });
});
