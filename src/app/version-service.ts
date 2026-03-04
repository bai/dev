import { Effect, Layer } from "effect";

import { GitTag, type Git } from "../domain/git-port";
import { PathServiceTag, type PathService } from "../domain/path-service";
import { VersionTag, type Version } from "../domain/version-port";

export const makeVersionLive = (gitPort: Git, pathService: PathService): Version => {
  const getCurrentGitCommitSha = gitPort.getCurrentCommitSha(pathService.devDir).pipe(Effect.orElseSucceed(() => "unknown"));

  return {
    getCurrentGitCommitSha,
    getVersion: getCurrentGitCommitSha,
  };
};

// Layer that provides VersionService
export const VersionLiveLayer = Layer.effect(
  VersionTag,
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const gitPort = yield* GitTag;
    return makeVersionLive(gitPort, pathService);
  }),
);
