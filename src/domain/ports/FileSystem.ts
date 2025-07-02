import { Context, type Effect } from "effect";

import type { ConfigError, UnknownError } from "../errors";

export interface FileSystem {
  /**
   * Read a file as text
   */
  readFile(path: string): Effect.Effect<string, ConfigError | UnknownError>;

  /**
   * Write text to a file
   */
  writeFile(path: string, content: string): Effect.Effect<void, ConfigError | UnknownError>;

  /**
   * Check if a file or directory exists
   */
  exists(path: string): Effect.Effect<boolean>;

  /**
   * Create a directory (and parent directories if needed)
   */
  mkdir(path: string, recursive?: boolean): Effect.Effect<void, ConfigError | UnknownError>;

  /**
   * List directories in a path
   */
  listDirectories(path: string): Effect.Effect<string[], ConfigError | UnknownError>;

  /**
   * Get the current working directory
   */
  getCwd(): Effect.Effect<string>;

  /**
   * Resolve a path (expand ~, resolve relative paths, etc.)
   */
  resolvePath(path: string): string;
}

// Service tag for Effect Context system
export class FileSystemService extends Context.Tag("FileSystemService")<FileSystemService, FileSystem>() {}
