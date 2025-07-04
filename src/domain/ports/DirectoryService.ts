import { Context, type Effect } from "effect";

import type { FileSystemError, UnknownError } from "../errors";
import type { PathServiceTag } from "../services/PathService";
import type { FileSystemService } from "./FileSystem";

/**
 * Directory service for managing development directories
 * This is a domain port for directory operations
 */
export interface Directory {
  ensureBaseDirectoryExists(): Effect.Effect<void, FileSystemError | UnknownError, FileSystemService | PathServiceTag>;
  findDirs(): Effect.Effect<string[], FileSystemError | UnknownError, FileSystemService | PathServiceTag>;
}

// Service tag for Effect Context system
export class DirectoryService extends Context.Tag("DirectoryService")<DirectoryService, Directory>() {}
