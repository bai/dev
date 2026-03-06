import { Effect, Layer } from "effect";

import { FileSystemTag, type FileSystem } from "~/capabilities/system/file-system-port";
import { DirectoryTag, type Directory } from "~/capabilities/workspace/directory-port";
import { type FileSystemError, type UnknownError } from "~/core/errors";
import { WorkspacePathsTag, type WorkspacePaths } from "~/core/runtime/path-service";

// Individual effect functions (dependencies captured at layer construction)
const ensureBaseDirectoryExists = (
  workspacePaths: WorkspacePaths,
  fileSystem: FileSystem,
): Effect.Effect<void, FileSystemError | UnknownError, never> =>
  Effect.gen(function* () {
    const baseDir = workspacePaths.baseSearchPath;
    const exists = yield* fileSystem.exists(baseDir);

    if (!exists) {
      yield* fileSystem.mkdir(baseDir, true);
    }
  });

const findDirs = (workspacePaths: WorkspacePaths, fileSystem: FileSystem): Effect.Effect<string[], FileSystemError | UnknownError, never> =>
  Effect.gen(function* () {
    const baseDir = workspacePaths.baseSearchPath;

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
export const makeDirectoryLive = (workspacePaths: WorkspacePaths, fileSystem: FileSystem): Directory => ({
  ensureBaseDirectoryExists: () => ensureBaseDirectoryExists(workspacePaths, fileSystem),
  findDirs: () => findDirs(workspacePaths, fileSystem),
});

// Layer that provides DirectoryService with proper dependency injection
export const DirectoryLiveLayer = Layer.effect(
  DirectoryTag,
  Effect.gen(function* () {
    const workspacePaths = yield* WorkspacePathsTag;
    const fileSystem = yield* FileSystemTag;
    return makeDirectoryLive(workspacePaths, fileSystem);
  }),
);
