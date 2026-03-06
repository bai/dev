import path from "path";

import { it } from "@effect/vitest";
import { Effect, Exit, Layer, Logger } from "effect";
import { describe, expect } from "vitest";

import { GitMock } from "~/capabilities/system/git-mock";
import { Git } from "~/capabilities/system/git-port";
import { DirectoryMock } from "~/capabilities/workspace/directory-mock";
import { Directory } from "~/capabilities/workspace/directory-port";
import { WorkspacePaths } from "~/core/runtime/path-service";
import { makeWorkspacePathsMock } from "~/core/runtime/path-service-mock";
import { syncCommand } from "~/features/sync/sync-command";

const makeWorkspacePaths = (baseSearchPath: string) => makeWorkspacePathsMock(baseSearchPath);

describe("sync-command", () => {
  it.effect("syncs only repositories detected as git repositories", () =>
    Effect.gen(function* () {
      const baseSearchPath = "/tmp/src";
      const firstRepo = path.join(baseSearchPath, "github.com/acme/first");
      const secondRepo = path.join(baseSearchPath, "github.com/acme/second");
      const git = new GitMock({
        gitRepositories: [firstRepo],
      });

      const testLayer = Layer.mergeAll(
        Layer.succeed(Directory, new DirectoryMock(["github.com/acme/first", "github.com/acme/second"])),
        Layer.succeed(Git, git),
        Layer.succeed(WorkspacePaths, makeWorkspacePaths(baseSearchPath)),
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
      const git = new GitMock({
        gitRepositories: [repo],
        failingPullRepositories: [repo],
      });

      const testLayer = Layer.mergeAll(
        Layer.succeed(Directory, new DirectoryMock(["github.com/acme/failing"])),
        Layer.succeed(Git, git),
        Layer.succeed(WorkspacePaths, makeWorkspacePaths(baseSearchPath)),
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
      const git = new GitMock({
        gitRepositories: [successRepo, failingRepo],
        failingPullRepositories: [failingRepo],
      });
      const loggedMessages: string[] = [];
      const logger = Logger.make(({ message }) => {
        loggedMessages.push(String(message));
      });

      const testLayer = Layer.mergeAll(
        Layer.succeed(Directory, new DirectoryMock(["github.com/acme/success", "github.com/acme/failing", "github.com/acme/not-git"])),
        Layer.succeed(Git, git),
        Layer.succeed(WorkspacePaths, makeWorkspacePaths(baseSearchPath)),
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
