import { Effect, Layer } from "effect";

import { type FileSystemError, type UnknownError } from "../domain/errors";
import { DirectoryPortTag, type DirectoryPort } from "../domain/directory-port";
import { FileSystemPortTag } from "../domain/file-system-port";
import { PathServiceTag } from "../domain/path-service";

// Individual effect functions
const ensureBaseDirectoryExists = (): Effect.Effect<
  void,
  FileSystemError | UnknownError,
  FileSystemPortTag | PathServiceTag
> =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemPortTag;

    const baseDir = pathService.baseSearchDir;
    const exists = yield* fileSystem.exists(baseDir);

    if (!exists) {
      yield* fileSystem.mkdir(baseDir, true);
    }
  });

const findDirs = (): Effect.Effect<string[], FileSystemError | UnknownError, FileSystemPortTag | PathServiceTag> =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemPortTag;

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
export const DirectoryLive: DirectoryPort = {
  ensureBaseDirectoryExists,
  findDirs,
};

// Layer that provides DirectoryService with proper dependency injection
export const DirectoryPortLiveLayer = Layer.effect(DirectoryPortTag, Effect.succeed(DirectoryLive));
