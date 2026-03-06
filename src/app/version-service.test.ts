import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import { gitError } from "../domain/errors";
import { GitTag } from "../domain/git-port";
import { PathServiceTag } from "../domain/path-service";
import { VersionTag } from "../domain/version-port";
import { GitMock } from "../infra/git-mock";
import { makePathServiceMock } from "../infra/path-service-mock";
import { VersionLiveLayer } from "./version-service";

const createGitMock = (getCurrentCommitShaImpl: GitMock["getCurrentCommitSha"]) =>
  new GitMock({
    overrides: {
      getCurrentCommitSha: getCurrentCommitShaImpl,
    },
    remoteUrl: "git@github.com:acme/dev.git",
  });

const makeVersionLayer = (git: GitMock, pathService = makePathServiceMock({ baseSearchPath: "/tmp/src", devDir: "/tmp/home/.dev" })) =>
  Layer.provide(VersionLiveLayer, Layer.mergeAll(Layer.succeed(GitTag, git), Layer.succeed(PathServiceTag, pathService)));

describe("version-service", () => {
  it.effect("returns current commit sha from Git", () => {
    const getCurrentCommitSha = vi.fn(() => Effect.succeed("abc123"));
    const gitMock = createGitMock(getCurrentCommitSha);
    const pathService = makePathServiceMock({ baseSearchPath: "/tmp/src", devDir: "/tmp/home/.dev" });

    return Effect.gen(function* () {
      const version = yield* VersionTag;
      const sha = yield* version.getCurrentGitCommitSha();

      expect(sha).toBe("abc123");
      expect(getCurrentCommitSha).toHaveBeenCalledWith(pathService.devDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, pathService)));
  });

  it.effect("falls back to 'unknown' when Git commit lookup fails", () => {
    const getCurrentCommitSha = vi.fn(() => gitError("git unavailable"));
    const gitMock = createGitMock(getCurrentCommitSha);
    const pathService = makePathServiceMock({ baseSearchPath: "/tmp/src", devDir: "/tmp/home/.dev" });

    return Effect.gen(function* () {
      const version = yield* VersionTag;
      const sha = yield* version.getCurrentGitCommitSha();

      expect(sha).toBe("unknown");
      expect(getCurrentCommitSha).toHaveBeenCalledWith(pathService.devDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, pathService)));
  });
});
