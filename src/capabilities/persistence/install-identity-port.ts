import { Effect } from "effect";

import type { ConfigError, UnknownError } from "~/core/errors";

export interface InstallIdentity {
  readonly getOrCreateInstallId: () => Effect.Effect<string, ConfigError | UnknownError>;
}

export class InstallIdentityTag extends Effect.Tag("InstallIdentity")<InstallIdentityTag, InstallIdentity>() {}
