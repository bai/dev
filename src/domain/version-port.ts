import { Context, type Effect } from "effect";

import type { GitTag } from "./git-port";
import type { PathServiceTag } from "./path-service";

/**
 * Version service port for getting CLI version information
 */
export interface Version {
  readonly getCurrentGitCommitSha: Effect.Effect<string, never, GitTag | PathServiceTag>;
  readonly getVersion: Effect.Effect<string, never, GitTag | PathServiceTag>;
}

export class VersionTag extends Context.Tag("Version")<VersionTag, Version>() {}
