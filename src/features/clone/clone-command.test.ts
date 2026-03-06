import { it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { describe, expect } from "vitest";

import { RepoProvider, type RepoProviderService } from "~/capabilities/repositories/repo-provider-port";
import { makeRepositoryService, RepositoryService } from "~/capabilities/repositories/repository-service";
import { FileSystemMock } from "~/capabilities/system/file-system-mock";
import { FileSystem } from "~/capabilities/system/file-system-port";
import { GitMock } from "~/capabilities/system/git-mock";
import { Git } from "~/capabilities/system/git-port";
import { ShellIntegration, type ShellIntegrationService } from "~/capabilities/workspace/shell-integration-service";
import { unknownError } from "~/core/errors";
import type { GitProvider, Repository } from "~/core/models";
import { WorkspacePaths, type WorkspacePathsService } from "~/core/runtime/path-service";
import { makeWorkspacePathsMock } from "~/core/runtime/path-service-mock";
import { cloneCommand } from "~/features/clone/clone-command";

describe("clone-command", () => {
  class MockFileSystem extends FileSystemMock {
    override getCwd(): Effect.Effect<string, never, never> {
      return Effect.succeed("/home/user/dev");
    }
  }

  class MockGit extends GitMock {
    constructor() {
      super({
        currentCommitSha: "abc123",
        currentBranch: "main",
        remoteUrl: "https://github.com/org/repo.git",
      });
    }
  }

  class MockRepoProvider implements RepoProviderService {
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

  const makeWorkspacePaths = (baseSearchPath = "/home/user/dev"): WorkspacePathsService => makeWorkspacePathsMock(baseSearchPath);

  class MockShellIntegration implements ShellIntegrationService {
    public changedDirectories: string[] = [];

    changeDirectory(path: string): Effect.Effect<void, never, never> {
      this.changedDirectories.push(path);
      return Effect.void;
    }
  }

  const repositoryServiceLayer = (workspacePaths: WorkspacePathsService = makeWorkspacePaths()) =>
    Layer.succeed(RepositoryService, makeRepositoryService(workspacePaths));

  describe("repository cloning", () => {
    it.effect("clones repository with org/repo format", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
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
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider("default-org")),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
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
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
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
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
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
            return unknownError("Failed to resolve repository") as unknown as Effect.Effect<Repository, never, never>;
          }
        }

        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new FailingRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
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
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider("github-org", githubProvider)),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
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
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider("gitlab-org", gitlabProvider)),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
        );

        const args = { repo: "gitlab-org/gitlab-repo" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos[0]?.repository.provider.name).toBe("gitlab");
        expect(git.clonedRepos[0]?.repository.cloneUrl).toBe("https://gitlab.com/gitlab-org/gitlab-repo.git");
      }),
    );
  });

  describe("URL cloning", () => {
    it.effect("clones repository from full HTTP URL", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
        );

        const args = { repo: "http://github.com/bai/dev.git" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos).toHaveLength(1);
        expect(git.clonedRepos[0]?.repository.name).toBe("dev");
        expect(git.clonedRepos[0]?.repository.organization).toBe("bai");
        expect(git.clonedRepos[0]?.repository.cloneUrl).toBe("http://github.com/bai/dev.git");
        expect(git.clonedRepos[0]?.repository.provider.name).toBe("github");
      }),
    );

    it.effect("clones repository from full HTTPS URL", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
        );

        const args = { repo: "https://github.com/bai/dev.git" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos).toHaveLength(1);
        expect(git.clonedRepos[0]?.repository.name).toBe("dev");
        expect(git.clonedRepos[0]?.repository.organization).toBe("bai");
        expect(git.clonedRepos[0]?.repository.cloneUrl).toBe("https://github.com/bai/dev.git");
        expect(git.clonedRepos[0]?.repository.provider.name).toBe("github");
      }),
    );

    it.effect("clones repository from git:// URL", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
        );

        const args = { repo: "git://github.com/bai/dev.git" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos).toHaveLength(1);
        expect(git.clonedRepos[0]?.repository.name).toBe("dev");
        expect(git.clonedRepos[0]?.repository.organization).toBe("bai");
        expect(git.clonedRepos[0]?.repository.cloneUrl).toBe("git://github.com/bai/dev.git");
        expect(git.clonedRepos[0]?.repository.provider.name).toBe("github");
      }),
    );

    it.effect("clones repository from git+ssh:// URL", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
        );

        const args = { repo: "git+ssh://git@github.com/bai/dev.git" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos).toHaveLength(1);
        expect(git.clonedRepos[0]?.repository.name).toBe("dev");
        expect(git.clonedRepos[0]?.repository.organization).toBe("bai");
        expect(git.clonedRepos[0]?.repository.cloneUrl).toBe("git+ssh://git@github.com/bai/dev.git");
        expect(git.clonedRepos[0]?.repository.provider.name).toBe("github");
      }),
    );

    it.effect("clones repository from ssh:// URL", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
        );

        const args = { repo: "ssh://git@github.com/bai/dev.git" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos).toHaveLength(1);
        expect(git.clonedRepos[0]?.repository.name).toBe("dev");
        expect(git.clonedRepos[0]?.repository.organization).toBe("bai");
        expect(git.clonedRepos[0]?.repository.cloneUrl).toBe("ssh://git@github.com/bai/dev.git");
        expect(git.clonedRepos[0]?.repository.provider.name).toBe("github");
      }),
    );

    it.effect("clones repository from full GitLab HTTPS URL", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
        );

        const args = { repo: "https://gitlab.com/myorg/myrepo.git" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos).toHaveLength(1);
        expect(git.clonedRepos[0]?.repository.name).toBe("myrepo");
        expect(git.clonedRepos[0]?.repository.organization).toBe("myorg");
        expect(git.clonedRepos[0]?.repository.provider.name).toBe("gitlab");
      }),
    );

    it.effect("clones repository from SSH URL", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
        );

        const args = { repo: "git@github.com:myorg/myrepo.git" };
        const command = cloneCommand.handler(args);

        yield* command.pipe(Effect.provide(testLayer));

        expect(git.clonedRepos).toHaveLength(1);
        expect(git.clonedRepos[0]?.repository.name).toBe("myrepo");
        expect(git.clonedRepos[0]?.repository.organization).toBe("myorg");
        expect(git.clonedRepos[0]?.repository.provider.name).toBe("github");
      }),
    );
  });

  describe("path handling", () => {
    it.effect("calculates relative path correctly", () =>
      Effect.gen(function* () {
        const fileSystem = new MockFileSystem();
        const git = new MockGit();
        const shellIntegration = new MockShellIntegration();
        const workspacePaths = makeWorkspacePaths("/Users/developer/projects");

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, workspacePaths),
          repositoryServiceLayer(workspacePaths),
          Layer.succeed(ShellIntegration, shellIntegration),
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
          Layer.succeed(FileSystem, fileSystem),
          Layer.succeed(Git, git),
          Layer.succeed(RepoProvider, new MockRepoProvider()),
          Layer.succeed(WorkspacePaths, makeWorkspacePaths()),
          repositoryServiceLayer(),
          Layer.succeed(ShellIntegration, shellIntegration),
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
