import { Effect, Layer } from "effect";

import { DirectoryTag, type Directory } from "../domain/directory-port";
import { type FileSystemError, type UnknownError } from "../domain/errors";
import { FileSystemTag } from "../domain/file-system-port";
import { PathServiceTag } from "../domain/path-service";

// Individual effect functions
const ensureBaseDirectoryExists = (): Effect.Effect<
  void,
  FileSystemError | UnknownError,
  FileSystemTag | PathServiceTag
> =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemTag;

    const baseDir = pathService.baseSearchPath;
    const exists = yield* fileSystem.exists(baseDir);

    if (!exists) {
      yield* fileSystem.mkdir(baseDir, true);
    }
  });

const findDirs = (): Effect.Effect<string[], FileSystemError | UnknownError, FileSystemTag | PathServiceTag> =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemTag;

    const baseDir = pathService.baseSearchPath;

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

// Factory function to create Directory implementation
export const makeDirectoryLive = (): Directory => ({
  ensureBaseDirectoryExists,
  findDirs,
});

// Layer that provides DirectoryService with proper dependency injection
export const DirectoryLiveLayer = Layer.effect(DirectoryTag, Effect.succeed(makeDirectoryLive()));
