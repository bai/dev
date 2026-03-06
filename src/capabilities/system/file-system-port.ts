import { Effect } from "effect";

import type { FileSystemError, UnknownError } from "~/core/errors";

export class FileSystemTag extends Effect.Tag("FileSystem")<
  FileSystemTag,
  {
    /**
     * Read a file as text
     */
    readFile(path: string): Effect.Effect<string, FileSystemError | UnknownError>;

    /**
     * Write text to a file
     */
    writeFile(path: string, content: string): Effect.Effect<void, FileSystemError | UnknownError>;

    /**
     * Check if a file or directory exists
     */
    exists(path: string): Effect.Effect<boolean>;

    /**
     * Create a directory (and parent directories if needed)
     */
    mkdir(path: string, recursive?: boolean): Effect.Effect<void, FileSystemError | UnknownError>;

    /**
     * Find directories using glob pattern
     */
    findDirectoriesGlob(basePath: string, pattern: string): Effect.Effect<string[], FileSystemError | UnknownError>;

    /**
     * Get the current working directory
     */
    getCwd(): Effect.Effect<string>;
  }
>() {}

export type FileSystem = (typeof FileSystemTag)["Service"];
