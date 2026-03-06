import { Effect } from "effect";

import type { ConfigError, UnknownError } from "~/core/errors";

export class InstallIdentityTag extends Effect.Tag("InstallIdentity")<
  InstallIdentityTag,
  {
    readonly getOrCreateInstallId: () => Effect.Effect<string, ConfigError | UnknownError>;
  }
>() {}

export type InstallIdentity = (typeof InstallIdentityTag)["Service"];
