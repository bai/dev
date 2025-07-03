import { Context, type Effect } from "effect";

import type { ConfigError, FileSystemError, UnknownError } from "../errors";

/**
 * Directory service for managing development directories
 * This is a domain port for directory operations
 */
export interface DirectoryService {
  ensureBaseDirectoryExists(): Effect.Effect<void, ConfigError | FileSystemError | UnknownError, any>;
  findDirs(): Effect.Effect<string[], ConfigError | FileSystemError | UnknownError, any>;
  findDirsLegacy(): Effect.Effect<string[], ConfigError | UnknownError, any>;
}

// Service tag for Effect Context system
export class DirectoryServiceTag extends Context.Tag("DirectoryService")<DirectoryServiceTag, DirectoryService>() {}
