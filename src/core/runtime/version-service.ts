import { Effect, Layer } from "effect";

import { Git, type GitService } from "~/capabilities/system/git-port";
import { InstallPaths, type InstallPathsService } from "~/core/runtime/path-service";
import { Version, type VersionService } from "~/core/runtime/version-port";

export const makeVersionLive = (gitPort: GitService, installPaths: InstallPathsService): VersionService => {
  const getCurrentGitCommitSha = () =>
    installPaths.installMode === "repo"
      ? gitPort.getCurrentCommitSha(installPaths.installDir).pipe(Effect.orElseSucceed(() => "unknown"))
      : Effect.succeed("unknown");

  const getVersion = () =>
    installPaths.installMode === "repo"
      ? gitPort.getCurrentCommitVersionInfo(installPaths.installDir).pipe(
          Effect.map((info) => `${info.timestamp}-${info.shortSha}`),
          Effect.orElseSucceed(() => "unknown"),
        )
      : Effect.succeed("unknown");

  return {
    getCurrentGitCommitSha,
    getVersion,
  };
};

// Layer that provides VersionService
export const VersionLiveLayer = Layer.effect(
  Version,
  Effect.gen(function* () {
    const installPaths = yield* InstallPaths;
    const gitPort = yield* Git;
    return makeVersionLive(gitPort, installPaths);
  }),
);
