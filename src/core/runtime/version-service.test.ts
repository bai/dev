import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import { GitMock } from "~/capabilities/system/git-mock";
import { GitTag } from "~/capabilities/system/git-port";
import { gitError } from "~/core/errors";
import { HostPathsTag } from "~/core/runtime/path-service";
import { makeHostPathsMock } from "~/core/runtime/path-service-mock";
import { VersionTag } from "~/core/runtime/version-port";
import { VersionLiveLayer } from "~/core/runtime/version-service";

const createGitMock = (getCurrentCommitShaImpl: GitMock["getCurrentCommitSha"]) =>
  new GitMock({
    overrides: {
      getCurrentCommitSha: getCurrentCommitShaImpl,
    },
    remoteUrl: "git@github.com:acme/dev.git",
  });

const makeVersionLayer = (git: GitMock, hostPaths = makeHostPathsMock({ homeDir: "/tmp/home", devDir: "/tmp/home/.dev" })) =>
  Layer.provide(VersionLiveLayer, Layer.mergeAll(Layer.succeed(GitTag, git), Layer.succeed(HostPathsTag, hostPaths)));

describe("version-service", () => {
  it.effect("returns current commit sha from Git", () => {
    const getCurrentCommitSha = vi.fn(() => Effect.succeed("abc123"));
    const gitMock = createGitMock(getCurrentCommitSha);
    const hostPaths = makeHostPathsMock({ homeDir: "/tmp/home", devDir: "/tmp/home/.dev" });

    return Effect.gen(function* () {
      const version = yield* VersionTag;
      const sha = yield* version.getCurrentGitCommitSha();

      expect(sha).toBe("abc123");
      expect(getCurrentCommitSha).toHaveBeenCalledWith(hostPaths.devDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, hostPaths)));
  });

  it.effect("falls back to 'unknown' when Git commit lookup fails", () => {
    const getCurrentCommitSha = vi.fn(() => gitError("git unavailable"));
    const gitMock = createGitMock(getCurrentCommitSha);
    const hostPaths = makeHostPathsMock({ homeDir: "/tmp/home", devDir: "/tmp/home/.dev" });

    return Effect.gen(function* () {
      const version = yield* VersionTag;
      const sha = yield* version.getCurrentGitCommitSha();

      expect(sha).toBe("unknown");
      expect(getCurrentCommitSha).toHaveBeenCalledWith(hostPaths.devDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, hostPaths)));
  });
});
