import { Effect, Layer } from "effect";

import { GitTag, type Git } from "~/capabilities/system/git-port";
import { HostPathsTag, type HostPaths } from "~/core/runtime/path-service";
import { VersionTag, type Version } from "~/core/runtime/version-port";

export const makeVersionLive = (gitPort: Git, hostPaths: HostPaths): Version => {
  const getCurrentGitCommitSha = () => gitPort.getCurrentCommitSha(hostPaths.devDir).pipe(Effect.orElseSucceed(() => "unknown"));

  return {
    getCurrentGitCommitSha,
    getVersion: () => getCurrentGitCommitSha(),
  };
};

// Layer that provides VersionService
export const VersionLiveLayer = Layer.effect(
  VersionTag,
  Effect.gen(function* () {
    const hostPaths = yield* HostPathsTag;
    const gitPort = yield* GitTag;
    return makeVersionLive(gitPort, hostPaths);
  }),
);
