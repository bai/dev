import path from "path";

import { Effect, Layer } from "effect";

import { configError, type ConfigError, type FileSystemError, type UnknownError } from "../../domain/errors";
import { DirectoryServiceTag, type DirectoryService } from "../../domain/ports/DirectoryService";
import { FileSystemService, type FileSystem } from "../../domain/ports/FileSystem";
import { PathServiceTag, type PathService } from "../../domain/services/PathService";

// Individual effect functions
const ensureBaseDirectoryExists = (): Effect.Effect<void, ConfigError | FileSystemError | UnknownError, any> =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemService;

    const baseDir = pathService.baseSearchDir;
    const exists = yield* fileSystem.exists(baseDir);

    if (!exists) {
      yield* fileSystem.mkdir(baseDir, true);
    }
  });

const findDirs = (): Effect.Effect<string[], ConfigError | FileSystemError | UnknownError, any> =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;
    const fileSystem = yield* FileSystemService;

    const baseDir = pathService.baseSearchDir;

    // Ensure base directory exists
    const exists = yield* fileSystem.exists(baseDir);
    if (!exists) {
      yield* fileSystem.mkdir(baseDir, true);
      return []; // Return empty array for new base directory
    }

    // Use FileSystem port to get directory listing
    // Note: This is a simplified implementation - in a real scenario,
    // we might need to add a listDirectoriesRecursive method to the FileSystem port
    const topLevelDirs = yield* fileSystem.listDirectories(baseDir);

    const result: string[] = [];

    for (const topDir of topLevelDirs) {
      const topPath = `${baseDir}/${topDir}`;
      const secondLevelDirs = yield* fileSystem
        .listDirectories(topPath)
        .pipe(Effect.catchAll(() => Effect.succeed([])));

      for (const secondDir of secondLevelDirs) {
        const secondPath = `${baseDir}/${topDir}/${secondDir}`;
        const thirdLevelDirs = yield* fileSystem
          .listDirectories(secondPath)
          .pipe(Effect.catchAll(() => Effect.succeed([])));

        for (const thirdDir of thirdLevelDirs) {
          result.push(`${topDir}/${secondDir}/${thirdDir}`);
        }
      }
    }

    return result;
  });

const findDirsLegacy = (): Effect.Effect<string[], ConfigError | UnknownError, any> =>
  Effect.gen(function* () {
    const pathService = yield* PathServiceTag;

    return yield* Effect.tryPromise({
      try: () => {
        // Legacy implementation using Bun.Glob directly
        const scanner = new Bun.Glob("*/*/*/");
        const matches = Array.from(scanner.scanSync({ cwd: pathService.baseSearchDir, onlyFiles: false }));
        return Promise.resolve(matches);
      },
      catch: (error: any) => configError(`Failed to scan directories: ${error.message}`),
    });
  });

// Plain object implementation
export const DirectoryServiceImpl: DirectoryService = {
  ensureBaseDirectoryExists,
  findDirs,
  findDirsLegacy,
};

// Layer that provides DirectoryService with proper dependency injection
export const DirectoryServiceLive = Layer.succeed(DirectoryServiceTag, DirectoryServiceImpl);
