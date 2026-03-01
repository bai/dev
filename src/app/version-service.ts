import { Effect, Layer } from "effect";

import { GitTag } from "../domain/git-port";
import { PathServiceTag } from "../domain/path-service";
import { VersionTag, type Version } from "../domain/version-port";

// Individual functions implementing the service methods
const getCurrentGitCommitSha = Effect.gen(function* () {
  const pathService = yield* PathServiceTag;
  const gitPort = yield* GitTag;

  const result = yield* gitPort.getCurrentCommitSha(pathService.devDir).pipe(Effect.orElseSucceed(() => "unknown"));

  return result;
});

// Functional service implementation as plain object
export const VersionLive: Version = {
  getCurrentGitCommitSha: getCurrentGitCommitSha,
  getVersion: getCurrentGitCommitSha, // Reuse the same effect
};

// Layer that provides VersionService
export const VersionLiveLayer = Layer.effect(VersionTag, Effect.succeed(VersionLive));
