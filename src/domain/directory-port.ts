import { Context, type Effect } from "effect";

import type { FileSystemError, UnknownError } from "./errors";
import type { FileSystemTag } from "./file-system-port";
import type { PathServiceTag } from "./path-service";

/**
 * Directory port for managing development directories
 * This is a domain port for directory operations
 */
export interface Directory {
  ensureBaseDirectoryExists(): Effect.Effect<void, FileSystemError | UnknownError, FileSystemTag | PathServiceTag>;
  findDirs(): Effect.Effect<string[], FileSystemError | UnknownError, FileSystemTag | PathServiceTag>;
}

export class DirectoryTag extends Context.Tag("Directory")<DirectoryTag, Directory>() {}
