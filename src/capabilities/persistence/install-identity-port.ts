import { Effect } from "effect";

import type { ConfigError, UnknownError } from "~/core/errors";

export class InstallIdentity extends Effect.Tag("InstallIdentity")<
  InstallIdentity,
  {
    readonly getOrCreateInstallId: () => Effect.Effect<string, ConfigError | UnknownError>;
  }
>() {}

export type InstallIdentityService = (typeof InstallIdentity)["Service"];
