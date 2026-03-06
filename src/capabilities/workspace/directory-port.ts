import { Effect } from "effect";

import type { FileSystemError, UnknownError } from "~/core/errors";

/**
 * Directory port for managing development directories
 * This is a domain port for directory operations
 */
export class Directory extends Effect.Tag("Directory")<
  Directory,
  {
    ensureBaseDirectoryExists(): Effect.Effect<void, FileSystemError | UnknownError, never>;
    findDirs(): Effect.Effect<string[], FileSystemError | UnknownError, never>;
  }
>() {}

export type DirectoryService = (typeof Directory)["Service"];
