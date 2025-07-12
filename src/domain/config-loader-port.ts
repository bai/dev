import { Context, type Effect } from "effect";

import type { ConfigError, FileSystemError, NetworkError, UnknownError } from "./errors";
import type { Config } from "./config-schema";

export interface ConfigLoader {
  load(): Effect.Effect<Config, ConfigError | FileSystemError | UnknownError>;
  save(config: Config): Effect.Effect<void, FileSystemError | UnknownError>;
  refresh(): Effect.Effect<Config, ConfigError | FileSystemError | NetworkError | UnknownError>;
}

export class ConfigLoaderTag extends Context.Tag("ConfigLoader")<ConfigLoaderTag, ConfigLoader>() {}
