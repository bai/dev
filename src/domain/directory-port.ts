import { Context, type Effect } from "effect";

import type { FileSystemError, UnknownError } from "./errors";
import type { FileSystemPortTag } from "./file-system-port";
import type { PathServiceTag } from "./path-service";

/**
 * Directory port for managing development directories
 * This is a domain port for directory operations
 */
export interface DirectoryPort {
  ensureBaseDirectoryExists(): Effect.Effect<void, FileSystemError | UnknownError, FileSystemPortTag | PathServiceTag>;
  findDirs(): Effect.Effect<string[], FileSystemError | UnknownError, FileSystemPortTag | PathServiceTag>;
}

export class DirectoryPortTag extends Context.Tag("DirectoryPort")<DirectoryPortTag, DirectoryPort>() {}
