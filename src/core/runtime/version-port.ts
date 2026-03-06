import { Effect } from "effect";

/**
 * Version service port for getting CLI version information
 */
export class VersionTag extends Effect.Tag("Version")<
  VersionTag,
  {
    readonly getCurrentGitCommitSha: () => Effect.Effect<string, never, never>;
    readonly getVersion: () => Effect.Effect<string, never, never>;
  }
>() {}

export type Version = (typeof VersionTag)["Service"];
