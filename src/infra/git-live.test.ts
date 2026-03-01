import { it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import { gitError, shellExecutionError } from "../domain/errors";
import type { Git } from "../domain/git-port";
import type { Repository } from "../domain/models";
import type { Shell, SpawnResult } from "../domain/shell-port";
import { makeGitLive } from "./git-live";

// Mock shell implementation for testing
class MockShell implements Shell {
  private responses = new Map<string, SpawnResult | Error>();

  setResponse(command: string, args: string[], response: SpawnResult | Error): void {
    const key = `${command} ${args.join(" ")}`;
    this.responses.set(key, response);
  }

  exec(command: string, args: string[] = [], _options?: { cwd?: string }): Effect.Effect<SpawnResult, never> {
    const key = `${command} ${args.join(" ")}`;
    const response = this.responses.get(key);

    if (!response) {
      return Effect.succeed({
        exitCode: 1,
        stdout: "",
        stderr: `Command not found: ${key}`,
      });
    }

    if (response instanceof Error) {
      return shellExecutionError(command, args, response.message) as never;
    }

    return Effect.succeed(response);
  }

  execInteractive(_command: string, _args?: string[], _options?: { cwd?: string }): Effect.Effect<number, never> {
    return Effect.succeed(0);
  }

  setProcessCwd(_path: string): Effect.Effect<void> {
    return Effect.succeed(undefined);
  }
}

describe("git-live", () => {
  let mockShell: MockShell;
  let git: Git;

  beforeEach(() => {
    mockShell = new MockShell();
    git = makeGitLive(mockShell);
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

        const result = yield* Effect.flip(git.cloneRepositoryToPath(repository, "/tmp/test-repo"));
        expect(result).toEqual(gitError("Failed to clone repository: fatal: repository not found"));
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

        const result = yield* Effect.flip(git.pullLatestChanges("/tmp/test-repo"));
        expect(result).toEqual(gitError("Failed to pull: fatal: not a git repository"));
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

        const result = yield* git.isGitRepository("/tmp/not-a-repo");
        expect(result).toBe(false);
      }),
    );

    it.effect("returns false when shell execution fails", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["rev-parse", "--git-dir"], new Error("Command failed"));

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

        const result = yield* Effect.flip(git.getCurrentCommitSha());
        expect(result).toEqual(gitError("Failed to get current commit SHA: fatal: ambiguous argument 'HEAD'"));
      }),
    );
  });

  describe("getRemoteOriginUrl", () => {
    it.effect("gets remote origin URL successfully", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["config", "--get", "remote.origin.url"], {
          exitCode: 0,
          stdout: "https://github.com/test-org/test-repo.git\n",
          stderr: "",
        });

        const result = yield* git.getRemoteOriginUrl("/tmp/test-repo");
        expect(result).toBe("https://github.com/test-org/test-repo.git");
      }),
    );

    it.effect("fails when remote origin is not configured", () =>
      Effect.gen(function* () {
        mockShell.setResponse("git", ["config", "--get", "remote.origin.url"], {
          exitCode: 1,
          stdout: "",
          stderr: "",
        });

        const result = yield* Effect.flip(git.getRemoteOriginUrl("/tmp/test-repo"));
        expect(result).toEqual(gitError("Failed to get remote URL: "));
      }),
    );
  });
});
