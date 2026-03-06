import { Effect } from "effect";

import type { Config } from "~/core/config/config-schema";
import type { ConfigError, FileSystemError, NetworkError, UnknownError } from "~/core/errors";

export class ConfigLoaderTag extends Effect.Tag("ConfigLoader")<
  ConfigLoaderTag,
  {
    parse(content: string, source?: string): Effect.Effect<Config, ConfigError>;
    load(): Effect.Effect<Config, ConfigError | FileSystemError | UnknownError>;
    save(config: Config): Effect.Effect<void, FileSystemError | UnknownError>;
    refresh(): Effect.Effect<Config, ConfigError | FileSystemError | NetworkError | UnknownError>;
  }
>() {}

export type ConfigLoader = (typeof ConfigLoaderTag)["Service"];
