import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import { GitMock } from "~/capabilities/system/git-mock";
import { Git } from "~/capabilities/system/git-port";
import { GitError } from "~/core/errors";
import { InstallPaths } from "~/core/runtime/path-service";
import { makeInstallPathsMock } from "~/core/runtime/path-service-mock";
import { Version } from "~/core/runtime/version-port";
import { VersionLiveLayer } from "~/core/runtime/version-service";

const createGitMock = (
  getCurrentCommitShaImpl: GitMock["getCurrentCommitSha"],
  getCurrentCommitVersionInfoImpl?: GitMock["getCurrentCommitVersionInfo"],
) =>
  new GitMock({
    overrides: {
      getCurrentCommitSha: getCurrentCommitShaImpl,
      getCurrentCommitVersionInfo: getCurrentCommitVersionInfoImpl,
    },
    remoteUrl: "git@github.com:acme/dev.git",
  });

const makeVersionLayer = (git: GitMock, installPaths = makeInstallPathsMock({ installDir: "/tmp/home/.dev" })) =>
  Layer.provide(VersionLiveLayer, Layer.mergeAll(Layer.succeed(Git, git), Layer.succeed(InstallPaths, installPaths)));

describe("version-service", () => {
  it.effect("returns current commit sha from Git in repo mode", () => {
    const getCurrentCommitSha = vi.fn(() => Effect.succeed("abc123"));
    const gitMock = createGitMock(getCurrentCommitSha);
    const installPaths = makeInstallPathsMock({ installDir: "/tmp/home/.dev" });

    return Effect.gen(function* () {
      const version = yield* Version;
      const sha = yield* version.getCurrentGitCommitSha();

      expect(sha).toBe("abc123");
      expect(getCurrentCommitSha).toHaveBeenCalledWith(installPaths.installDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, installPaths)));
  });

  it.effect("falls back to 'unknown' when Git commit lookup fails", () => {
    const getCurrentCommitSha = vi.fn(() => new GitError({ message: "git unavailable" }));
    const gitMock = createGitMock(getCurrentCommitSha);
    const installPaths = makeInstallPathsMock({ installDir: "/tmp/home/.dev" });

    return Effect.gen(function* () {
      const version = yield* Version;
      const sha = yield* version.getCurrentGitCommitSha();

      expect(sha).toBe("unknown");
      expect(getCurrentCommitSha).toHaveBeenCalledWith(installPaths.installDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, installPaths)));
  });

  it.effect("returns commit timestamp and short sha in repo mode", () => {
    const getCurrentCommitSha = vi.fn(() => Effect.succeed("abc123def456"));
    const getCurrentCommitVersionInfo = vi.fn(() =>
      Effect.succeed({
        shortSha: "abc123d",
        timestamp: "20260316112233",
      }),
    );
    const gitMock = createGitMock(getCurrentCommitSha, getCurrentCommitVersionInfo);
    const installPaths = makeInstallPathsMock({ installDir: "/tmp/home/.dev" });

    return Effect.gen(function* () {
      const version = yield* Version;
      const value = yield* version.getVersion();

      expect(value).toBe("20260316112233-abc123d");
      expect(getCurrentCommitVersionInfo).toHaveBeenCalledWith(installPaths.installDir);
    }).pipe(Effect.provide(makeVersionLayer(gitMock, installPaths)));
  });

  it.effect("returns unknown in non-repo mode without calling Git", () => {
    const getCurrentCommitSha = vi.fn(() => Effect.succeed("should-not-be-used"));
    const getCurrentCommitVersionInfo = vi.fn(() =>
      Effect.succeed({
        shortSha: "should-not-be-used",
        timestamp: "20260316112233",
      }),
    );
    const gitMock = createGitMock(getCurrentCommitSha, getCurrentCommitVersionInfo);
    const installPaths = makeInstallPathsMock({
      installMode: "binary",
      installDir: "/tmp/dist",
      upgradeCapable: false,
    });

    return Effect.gen(function* () {
      const version = yield* Version;

      expect(yield* version.getCurrentGitCommitSha()).toBe("unknown");
      expect(yield* version.getVersion()).toBe("unknown");
      expect(getCurrentCommitSha).not.toHaveBeenCalled();
      expect(getCurrentCommitVersionInfo).not.toHaveBeenCalled();
    }).pipe(Effect.provide(makeVersionLayer(gitMock, installPaths)));
  });
});
