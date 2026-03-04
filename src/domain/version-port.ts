import { Context, type Effect } from "effect";

/**
 * Version service port for getting CLI version information
 */
export interface Version {
  readonly getCurrentGitCommitSha: Effect.Effect<string, never, never>;
  readonly getVersion: Effect.Effect<string, never, never>;
}

export class VersionTag extends Context.Tag("Version")<VersionTag, Version>() {}
