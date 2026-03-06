import { Effect } from "effect";

/**
 * Version service port for getting CLI version information
 */
export class Version extends Effect.Tag("Version")<
  Version,
  {
    readonly getCurrentGitCommitSha: () => Effect.Effect<string, never, never>;
    readonly getVersion: () => Effect.Effect<string, never, never>;
  }
>() {}

export type VersionService = (typeof Version)["Service"];
