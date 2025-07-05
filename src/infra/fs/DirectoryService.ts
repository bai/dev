import { Effect, Layer } from "effect";

import { type FileSystemError, type UnknownError } from "../../domain/errors";
import { DirectoryTag, type Directory } from "../../domain/ports/DirectoryService";
import { FileSystemTag, type FileSystem } from "../../domain/ports/FileSystem";
import { PathServiceTag, type PathService } from "../../domain/services/PathService";

// Individual effect functions
const ensureBaseDirectoryExists = (): Effect.Effect<
  void,
  FileSystemError | UnknownError,
  FileSystemTag | PathServiceTag
> =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemTag;

    const baseDir = pathService.baseSearchDir;
    const exists = yield* fileSystem.exists(baseDir);

    if (!exists) {
      yield* fileSystem.mkdir(baseDir, true);
    }
  });

const findDirs = (): Effect.Effect<string[], FileSystemError | UnknownError, FileSystemTag | PathServiceTag> =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemTag;

    const baseDir = pathService.baseSearchDir;

    // Ensure base directory exists
    const exists = yield* fileSystem.exists(baseDir);
    if (!exists) {
      yield* fileSystem.mkdir(baseDir, true);
      return []; // Return empty array for new base directory
    }

    // Use FileSystem port to efficiently scan for directories at exactly 3 levels deep
    const directories = yield* fileSystem.findDirectoriesGlob(baseDir, "*/*/*/");
    return directories;
  });

// Plain object implementation
export const DirectoryServiceImpl: Directory = {
  ensureBaseDirectoryExists,
  findDirs,
};

// Layer that provides DirectoryService with proper dependency injection
export const DirectoryServiceLive = Layer.effect(DirectoryTag, Effect.succeed(DirectoryServiceImpl));
