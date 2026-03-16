import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import { GitLiveLayer } from "~/capabilities/system/git-live";
import { Git, type GitService } from "~/capabilities/system/git-port";
import { ShellMock } from "~/capabilities/system/shell-mock";
import { Shell, type SpawnResult } from "~/capabilities/system/shell-port";
import { GitError } from "~/core/errors";
import type { Repository } from "~/core/models";

class MockShell extends ShellMock {
  setResponse(command: string, args: string[], response: SpawnResult | Error): void {
    if (response instanceof Error) {
      this.setExecFailure(command, args);
      return;
    }

    this.setExecResponse(command, args, response);
  }
}

describe("git-live", () => {
  let mockShell: MockShell;

  const makeGit = (shell: MockShell): Effect.Effect<GitService> =>
    Effect.gen(function* () {
      return yield* Git;
    }).pipe(Effect.provide(Layer.provide(GitLiveLayer, Layer.succeed(Shell, shell))));

  beforeEach(() => {
    mockShell = new MockShell();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("cloneRepositoryToPath", () => {
    it.effect("clones a repository successfully", () =>
      Effect.gen(function* () {
        const repository: Repository = {
          name: "test-repo",
          organization: "test-org",
          provider: { name: "github", baseUrl: "https://github.com" },
          cloneUrl: "https://github.com/test-org/test-repo.git",
        };

        mockShell.setResponse("git", ["clone", repository.cloneUrl, "/tmp/test-repo"], {
          exitCode: 0,
          stdout: "Cloning into '/tmp/test-repo'...",
          stderr: "",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* git.cloneRepositoryToPath(repository, "/tmp/test-repo");
        expect(result).toBeUndefined();
      }),
    );

    it.effect("fails when git clone returns non-zero exit code", () =>
      Effect.gen(function* () {
        const repository: Repository = {
          name: "test-repo",
          organization: "test-org",
          provider: { name: "github", baseUrl: "https://github.com" },
          cloneUrl: "https://github.com/test-org/test-repo.git",
        };

        mockShell.setResponse("git", ["clone", repository.cloneUrl, "/tmp/test-repo"], {
          exitCode: 128,
          stdout: "",
          stderr: "fatal: repository not found",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* Effect.flip(git.cloneRepositoryToPath(repository, "/tmp/test-repo"));
        expect(result).toEqual(new GitError({ message: "Failed to clone repository: fatal: repository not found" }));
      }),
    );
  });

  describe("pullLatestChanges", () => {
    it.effect("pulls changes successfully", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["pull"], {
          exitCode: 0,
          stdout: "Already up to date.",
          stderr: "",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* git.pullLatestChanges("/tmp/test-repo");
        expect(result).toBeUndefined();
      }),
    );

    it.effect("fails when git pull returns non-zero exit code", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["pull"], {
          exitCode: 128,
          stdout: "",
          stderr: "fatal: not a git repository",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* Effect.flip(git.pullLatestChanges("/tmp/test-repo"));
        expect(result).toEqual(new GitError({ message: "Failed to pull: fatal: not a git repository" }));
      }),
    );
  });

  describe("isGitRepository", () => {
    it.effect("returns true for a git repository", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["rev-parse", "--git-dir"], {
          exitCode: 0,
          stdout: ".git",
          stderr: "",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* git.isGitRepository("/tmp/test-repo");
        expect(result).toBe(true);
      }),
    );

    it.effect("returns false for a non-git repository", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["rev-parse", "--git-dir"], {
          exitCode: 128,
          stdout: "",
          stderr: "fatal: not a git repository",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* git.isGitRepository("/tmp/not-a-repo");
        expect(result).toBe(false);
      }),
    );

    it.effect("returns false when shell execution fails", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["rev-parse", "--git-dir"], new Error("Command failed"));

        const git = yield* makeGit(mockShell);
        const result = yield* git.isGitRepository("/tmp/test-repo");
        expect(result).toBe(false);
      }),
    );
  });

  describe("getCurrentCommitSha", () => {
    it.effect("gets current commit SHA successfully", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["rev-parse", "HEAD"], {
          exitCode: 0,
          stdout: "abc123def456\n",
          stderr: "",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* git.getCurrentCommitSha("/tmp/test-repo");
        expect(result).toBe("abc123def456");
      }),
    );

    it.effect("works without specifying a repository path", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["rev-parse", "HEAD"], {
          exitCode: 0,
          stdout: "xyz789\n",
          stderr: "",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* git.getCurrentCommitSha();
        expect(result).toBe("xyz789");
      }),
    );

    it.effect("fails when git rev-parse returns non-zero exit code", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["rev-parse", "HEAD"], {
          exitCode: 128,
          stdout: "",
          stderr: "fatal: ambiguous argument 'HEAD'",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* Effect.flip(git.getCurrentCommitSha());
        expect(result).toEqual(new GitError({ message: "Failed to get current commit SHA: fatal: ambiguous argument 'HEAD'" }));
      }),
    );
  });

  describe("getCurrentCommitVersionInfo", () => {
    it.effect("gets current commit timestamp and short sha successfully", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["show", "-s", "--format=%cd%n%h", "--date=format:%Y%m%d%H%M%S", "HEAD"], {
          exitCode: 0,
          stdout: "20260316112233\nabc123d\n",
          stderr: "",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* git.getCurrentCommitVersionInfo("/tmp/test-repo");
        expect(result).toEqual({
          shortSha: "abc123d",
          timestamp: "20260316112233",
        });
      }),
    );

    it.effect("fails when commit version info cannot be parsed", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["show", "-s", "--format=%cd%n%h", "--date=format:%Y%m%d%H%M%S", "HEAD"], {
          exitCode: 0,
          stdout: "20260316112233\n",
          stderr: "",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* Effect.flip(git.getCurrentCommitVersionInfo("/tmp/test-repo"));
        expect(result).toEqual(new GitError({ message: "Failed to parse current commit version info" }));
      }),
    );
  });

  describe("getCurrentBranch", () => {
    it.effect("gets current branch successfully", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          exitCode: 0,
          stdout: "main\n",
          stderr: "",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* git.getCurrentBranch("/tmp/test-repo");
        expect(result).toBe("main");
      }),
    );

    it.effect("fails when branch cannot be resolved", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
          exitCode: 128,
          stdout: "",
          stderr: "fatal: not a git repository",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* Effect.flip(git.getCurrentBranch("/tmp/test-repo"));
        expect(result).toEqual(new GitError({ message: "Failed to get current branch: fatal: not a git repository" }));
      }),
    );
  });

  describe("getRemoteUrl", () => {
    it.effect("gets remote URL successfully", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["remote", "get-url", "origin"], {
          exitCode: 0,
          stdout: "https://github.com/test-org/test-repo.git\n",
          stderr: "",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* git.getRemoteUrl("/tmp/test-repo", "origin");
        expect(result).toBe("https://github.com/test-org/test-repo.git");
      }),
    );

    it.effect("fails when remote is not configured", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["remote", "get-url", "origin"], {
          exitCode: 1,
          stdout: "",
          stderr: "",
        });

        const git = yield* makeGit(mockShell);
        const result = yield* Effect.flip(git.getRemoteUrl("/tmp/test-repo", "origin"));
        expect(result).toEqual(new GitError({ message: "Failed to get remote URL: " }));
      }),
    );
  });
});
