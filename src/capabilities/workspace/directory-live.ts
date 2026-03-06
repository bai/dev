import { Effect, Layer } from "effect";

import { FileSystem, type FileSystemService } from "~/capabilities/system/file-system-port";
import { Directory, type DirectoryService } from "~/capabilities/workspace/directory-port";
import { type FileSystemError, type UnknownError } from "~/core/errors";
import { WorkspacePaths, type WorkspacePathsService } from "~/core/runtime/path-service";

// Individual effect functions (dependencies captured at layer construction)
const ensureBaseDirectoryExists = (
  workspacePaths: WorkspacePathsService,
  fileSystem: FileSystemService,
): Effect.Effect<void, FileSystemError | UnknownError, never> =>
  Effect.gen(function* () {
    const baseDir = workspacePaths.baseSearchPath;
    const exists = yield* fileSystem.exists(baseDir);

    if (!exists) {
      yield* fileSystem.mkdir(baseDir, true);
    }
  });

const findDirs = (
  workspacePaths: WorkspacePathsService,
  fileSystem: FileSystemService,
): Effect.Effect<string[], FileSystemError | UnknownError, never> =>
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

// Layer that provides DirectoryService with proper dependency injection
export const DirectoryLiveLayer = Layer.effect(
  Directory,
  Effect.gen(function* () {
    const workspacePaths = yield* WorkspacePaths;
    const fileSystem = yield* FileSystem;
    return {
      ensureBaseDirectoryExists: () => ensureBaseDirectoryExists(workspacePaths, fileSystem),
      findDirs: () => findDirs(workspacePaths, fileSystem),
    } satisfies DirectoryService;
  }),
);
