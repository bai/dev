import { Context, type Effect } from "effect";

import type { FileSystemError, UnknownError } from "../errors";
import type { PathServiceTag } from "../services/PathService";
import type { FileSystemTag } from "./FileSystem";

/**
 * Directory service for managing development directories
 * This is a domain port for directory operations
 */
export interface Directory {
  ensureBaseDirectoryExists(): Effect.Effect<void, FileSystemError | UnknownError, FileSystemTag | PathServiceTag>;
  findDirs(): Effect.Effect<string[], FileSystemError | UnknownError, FileSystemTag | PathServiceTag>;
}

// Service tag for Effect Context system
export class DirectoryTag extends Context.Tag("Directory")<DirectoryTag, Directory>() {}
