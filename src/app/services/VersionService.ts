import { Context, Effect, Layer } from "effect";

import { GitService } from "../../domain/ports/Git";
import { PathServiceTag } from "../../domain/services/PathService";

/**
 * Version service for getting CLI version information
 * This is app-level logic for version handling
 */
export interface VersionService {
  readonly getCurrentGitCommitSha: Effect.Effect<string, never, GitService | PathServiceTag>;
  readonly getVersion: Effect.Effect<string, never, GitService | PathServiceTag>;
}

// Individual functions implementing the service methods
const getCurrentGitCommitSha = Effect.gen(function* () {
  const pathService = yield* PathServiceTag;
  const gitService = yield* GitService;

  const result = yield* gitService
    .getCurrentCommitSha(pathService.devDir)
    .pipe(Effect.catchAll(() => Effect.succeed("unknown")));

  return result;
});

// Functional service implementation as plain object
export const VersionServiceImpl: VersionService = {
  getCurrentGitCommitSha: getCurrentGitCommitSha,
  getVersion: getCurrentGitCommitSha, // Reuse the same effect
};

// Service tag for Effect Context system
export class VersionServiceTag extends Context.Tag("VersionService")<VersionServiceTag, VersionService>() {}

// Layer that provides VersionService (no `new` keyword)
export const VersionServiceLive = Layer.succeed(VersionServiceTag, VersionServiceImpl);
