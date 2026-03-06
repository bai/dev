import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import { GitMock } from "~/capabilities/system/git-mock";
import { GitTag } from "~/capabilities/system/git-port";
import { gitError } from "~/core/errors";
import { InstallPathsTag } from "~/core/runtime/path-service";
import { makeInstallPathsMock } from "~/core/runtime/path-service-mock";
import { VersionTag } from "~/core/runtime/version-port";
import { VersionLiveLayer } from "~/core/runtime/version-service";

const createGitMock = (getCurrentCommitShaImpl: GitMock["getCurrentCommitSha"]) =>
  new GitMock({
    overrides: {
      getCurrentCommitSha: getCurrentCommitShaImpl,
    },
    remoteUrl: "git@github.com:acme/dev.git",
  });

const makeVersionLayer = (git: GitMock, installPaths = makeInstallPathsMock({ installDir: "/tmp/home/.dev" })) =>
  Layer.provide(VersionLiveLayer, Layer.mergeAll(Layer.succeed(GitTag, git), Layer.succeed(InstallPathsTag, installPaths)));

describe("version-service", () => {
  it.effect("returns current commit sha from Git in repo mode", () => {
    const getCurrentCommitSha = vi.fn(() => Effect.succeed("abc123"));
    const gitMock = createGitMock(getCurrentCommitSha);
    const installPaths = makeInstallPathsMock({ installDir: "/tmp/home/.dev" });

    return Effect.gen(function* () {
      const version = yield* VersionTag;
      const sha = yield* version.getCurrentGitCommitSha();

      expect(sha).toBe("abc123");
      expect(getCurrentCommitSha).toHaveBeenCalledWith(installPaths.installDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, installPaths)));
  });

  it.effect("falls back to 'unknown' when Git commit lookup fails", () => {
    const getCurrentCommitSha = vi.fn(() => gitError("git unavailable"));
    const gitMock = createGitMock(getCurrentCommitSha);
    const installPaths = makeInstallPathsMock({ installDir: "/tmp/home/.dev" });

    return Effect.gen(function* () {
      const version = yield* VersionTag;
      const sha = yield* version.getCurrentGitCommitSha();

      expect(sha).toBe("unknown");
      expect(getCurrentCommitSha).toHaveBeenCalledWith(installPaths.installDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, installPaths)));
  });

  it.effect("returns unknown in non-repo mode without calling Git", () => {
    const getCurrentCommitSha = vi.fn(() => Effect.succeed("should-not-be-used"));
    const gitMock = createGitMock(getCurrentCommitSha);
    const installPaths = makeInstallPathsMock({
      installMode: "binary",
      installDir: "/tmp/dist",
      upgradeCapable: false,
    });

    return Effect.gen(function* () {
      const version = yield* VersionTag;

      expect(yield* version.getCurrentGitCommitSha()).toBe("unknown");
      expect(yield* version.getVersion()).toBe("unknown");
      expect(getCurrentCommitSha).not.toHaveBeenCalled();
    }).pipe(Effect.provide(makeVersionLayer(gitMock, installPaths)));
  });
});
