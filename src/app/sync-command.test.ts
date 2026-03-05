import path from "path";

import { it } from "@effect/vitest";
import { Effect, Exit, Layer, Logger } from "effect";
import { describe, expect } from "vitest";

import { DirectoryTag, type Directory } from "../domain/directory-port";
import { gitError } from "../domain/errors";
import { GitTag, type Git } from "../domain/git-port";
import { type PathService, PathServiceTag } from "../domain/path-service";
import { syncCommand } from "./sync-command";

class MockDirectory implements Directory {
  constructor(private readonly directories: string[]) {}

  ensureBaseDirectoryExists() {
    return Effect.void;
  }

  findDirs() {
    return Effect.succeed(this.directories);
  }
}

class MockGit implements Git {
  public pullCalls: string[] = [];

  constructor(
    private readonly gitRepositories: Set<string>,
    private readonly failingRepositories = new Set<string>(),
  ) {}

  cloneRepositoryToPath() {
    return Effect.void;
  }

  pullLatestChanges(repositoryPath: string) {
    this.pullCalls.push(repositoryPath);

    if (this.failingRepositories.has(repositoryPath)) {
      return gitError("pull failed");
    }

    return Effect.void;
  }

  isGitRepository(repositoryPath: string) {
    return Effect.succeed(this.gitRepositories.has(repositoryPath));
  }

  getCurrentCommitSha() {
    return Effect.succeed("commit-sha");
  }

  getCurrentBranch() {
    return Effect.succeed("main");
  }

  getRemoteUrl() {
    return Effect.succeed("https://example.com/repo.git");
  }
}

const makePathService = (baseSearchPath: string): PathService => ({
  homeDir: "/tmp",
  baseSearchPath,
  devDir: "/tmp/.dev",
  configDir: "/tmp/.config/dev",
  configPath: "/tmp/.config/dev/config.json",
  dataDir: "/tmp/.local/share/dev",
  dbPath: "/tmp/.local/share/dev/dev.db",
  cacheDir: "/tmp/.cache/dev",
  getBasePath: () => baseSearchPath,
});

describe("sync-command", () => {
  it.effect("syncs only repositories detected as git repositories", () =>
    Effect.gen(function* () {
      const baseSearchPath = "/tmp/src";
      const firstRepo = path.join(baseSearchPath, "github.com/acme/first");
      const secondRepo = path.join(baseSearchPath, "github.com/acme/second");
      const git = new MockGit(new Set([firstRepo]));

      const testLayer = Layer.mergeAll(
        Layer.succeed(DirectoryTag, new MockDirectory(["github.com/acme/first", "github.com/acme/second"])),
        Layer.succeed(GitTag, git),
        Layer.succeed(PathServiceTag, makePathService(baseSearchPath)),
      );

      yield* syncCommand.handler({}).pipe(Effect.provide(testLayer));

      expect(git.pullCalls).toEqual([firstRepo]);
      expect(git.pullCalls).not.toContain(secondRepo);
    }),
  );

  it.effect("continues syncing when one repository pull fails", () =>
    Effect.gen(function* () {
      const baseSearchPath = "/tmp/src";
      const repo = path.join(baseSearchPath, "github.com/acme/failing");
      const git = new MockGit(new Set([repo]), new Set([repo]));

      const testLayer = Layer.mergeAll(
        Layer.succeed(DirectoryTag, new MockDirectory(["github.com/acme/failing"])),
        Layer.succeed(GitTag, git),
        Layer.succeed(PathServiceTag, makePathService(baseSearchPath)),
      );

      const result = yield* Effect.exit(syncCommand.handler({}).pipe(Effect.provide(testLayer)));

      expect(Exit.isSuccess(result)).toBe(true);
      expect(git.pullCalls).toEqual([repo]);
    }),
  );

  it.effect("reports accurate success and failure totals for mixed outcomes", () =>
    Effect.gen(function* () {
      const baseSearchPath = "/tmp/src";
      const successRepo = path.join(baseSearchPath, "github.com/acme/success");
      const failingRepo = path.join(baseSearchPath, "github.com/acme/failing");
      const nonGitRepo = path.join(baseSearchPath, "github.com/acme/not-git");
      const git = new MockGit(new Set([successRepo, failingRepo]), new Set([failingRepo]));
      const loggedMessages: string[] = [];
      const logger = Logger.make(({ message }) => {
        loggedMessages.push(String(message));
      });

      const testLayer = Layer.mergeAll(
        Layer.succeed(DirectoryTag, new MockDirectory(["github.com/acme/success", "github.com/acme/failing", "github.com/acme/not-git"])),
        Layer.succeed(GitTag, git),
        Layer.succeed(PathServiceTag, makePathService(baseSearchPath)),
        Logger.replace(Logger.defaultLogger, logger),
      );

      yield* syncCommand.handler({}).pipe(Effect.provide(testLayer));

      expect(git.pullCalls).toEqual([successRepo, failingRepo]);
      expect(git.pullCalls).not.toContain(nonGitRepo);
      expect(loggedMessages).toContain("Success: 1");
      expect(loggedMessages).toContain("Failed: 1");
    }),
  );
});
