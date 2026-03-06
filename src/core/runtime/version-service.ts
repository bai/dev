import { Effect, Layer } from "effect";

import { GitTag, type Git } from "~/capabilities/system/git-port";
import { InstallPathsTag, type InstallPaths } from "~/core/runtime/path-service";
import { VersionTag, type Version } from "~/core/runtime/version-port";

export const makeVersionLive = (gitPort: Git, installPaths: InstallPaths): Version => {
  const getCurrentGitCommitSha = () =>
    installPaths.installMode === "repo"
      ? gitPort.getCurrentCommitSha(installPaths.installDir).pipe(Effect.orElseSucceed(() => "unknown"))
      : Effect.succeed("unknown");

  return {
    getCurrentGitCommitSha,
    getVersion: getCurrentGitCommitSha,
  };
};

// Layer that provides VersionService
export const VersionLiveLayer = Layer.effect(
  VersionTag,
  Effect.gen(function* () {
    const installPaths = yield* InstallPathsTag;
    const gitPort = yield* GitTag;
    return makeVersionLive(gitPort, installPaths);
  }),
);
