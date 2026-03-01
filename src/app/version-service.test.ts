import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import { gitError } from "../domain/errors";
import { GitTag, type Git } from "../domain/git-port";
import { createPathService, PathServiceTag } from "../domain/path-service";
import { VersionTag } from "../domain/version-port";
import { VersionLiveLayer } from "./version-service";

const createGitMock = (getCurrentCommitShaImpl: Git["getCurrentCommitSha"]): Git => ({
  cloneRepositoryToPath: () => Effect.void,
  pullLatestChanges: () => Effect.void,
  isGitRepository: () => Effect.succeed(true),
  getCurrentCommitSha: getCurrentCommitShaImpl,
  getRemoteOriginUrl: () => Effect.succeed("git@github.com:acme/dev.git"),
});

const makeVersionLayer = (git: Git, pathService = createPathService("/tmp/src")) =>
  Layer.mergeAll(VersionLiveLayer, Layer.succeed(GitTag, git), Layer.succeed(PathServiceTag, pathService));

describe("version-service", () => {
  it.effect("returns current commit sha from Git", () => {
    const getCurrentCommitSha = vi.fn(() => Effect.succeed("abc123"));
    const gitMock = createGitMock(getCurrentCommitSha);
    const pathService = createPathService("/tmp/src");

    return Effect.gen(function* () {
      const version = yield* VersionTag;
      const sha = yield* version.getCurrentGitCommitSha;

      expect(sha).toBe("abc123");
      expect(getCurrentCommitSha).toHaveBeenCalledWith(pathService.devDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, pathService)));
  });

  it.effect("falls back to 'unknown' when Git commit lookup fails", () => {
    const getCurrentCommitSha = vi.fn(() => gitError("git unavailable"));
    const gitMock = createGitMock(getCurrentCommitSha);
    const pathService = createPathService("/tmp/src");

    return Effect.gen(function* () {
      const version = yield* VersionTag;
      const sha = yield* version.getCurrentGitCommitSha;

      expect(sha).toBe("unknown");
      expect(getCurrentCommitSha).toHaveBeenCalledWith(pathService.devDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, pathService)));
  });
});
