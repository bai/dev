import { Effect } from "effect";

import type { FileSystemError, UnknownError } from "~/core/errors";

/**
 * Directory port for managing development directories
 * This is a domain port for directory operations
 */
export interface Directory {
  ensureBaseDirectoryExists(): Effect.Effect<void, FileSystemError | UnknownError, never>;
  findDirs(): Effect.Effect<string[], FileSystemError | UnknownError, never>;
}

export class DirectoryTag extends Effect.Tag("Directory")<DirectoryTag, Directory>() {}
