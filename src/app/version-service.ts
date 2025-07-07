import { Context, Effect, Layer } from "effect";

import { GitPortTag } from "../domain/git-port";
import { PathServiceTag } from "../domain/path-service";

/**
 * Version service for getting CLI version information
 * This is app-level logic for version handling
 */
export interface Version {
  readonly getCurrentGitCommitSha: Effect.Effect<string, never, GitPortTag | PathServiceTag>;
  readonly getVersion: Effect.Effect<string, never, GitPortTag | PathServiceTag>;
}

// Individual functions implementing the service methods
const getCurrentGitCommitSha = Effect.gen(function* () {
  const pathService = yield* PathServiceTag;
  const gitPort = yield* GitPortTag;

  const result = yield* gitPort
    .getCurrentCommitSha(pathService.devDir)
    .pipe(Effect.catchAll(() => Effect.succeed("unknown")));

  return result;
});

// Functional service implementation as plain object
export const VersionLive: Version = {
  getCurrentGitCommitSha: getCurrentGitCommitSha,
  getVersion: getCurrentGitCommitSha, // Reuse the same effect
};

// Service tag for Effect Context system
export class VersionTag extends Context.Tag("Version")<VersionTag, Version>() {}

// Layer that provides VersionService (no `new` keyword)
export const VersionLiveLayer = Layer.effect(VersionTag, Effect.succeed(VersionLive));
