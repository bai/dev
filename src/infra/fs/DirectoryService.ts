import { Context, Effect, Layer } from "effect";

import { configError, type ConfigError, type UnknownError } from "../../domain/errors";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { PathServiceTag } from "../../domain/services/PathService";

/**
 * Directory service for managing development directories
 * This is infrastructure-level directory operations
 */
export interface DirectoryService {
  ensureBaseDirectoryExists(): Effect.Effect<void, ConfigError | UnknownError, FileSystemService | PathServiceTag>;
  findDirs(): Effect.Effect<string[], ConfigError | UnknownError, FileSystemService | PathServiceTag>;
  findDirsLegacy(): Effect.Effect<string[], ConfigError | UnknownError, PathServiceTag>;
}

export class DirectoryServiceImpl implements DirectoryService {
  ensureBaseDirectoryExists(): Effect.Effect<void, ConfigError | UnknownError, FileSystemService | PathServiceTag> {
    return Effect.gen(function* () {
      const pathService = yield* PathServiceTag;
      const fileSystem = yield* FileSystemService;

      const baseDir = pathService.baseSearchDir;
      const exists = yield* fileSystem.exists(baseDir);

      if (!exists) {
        yield* fileSystem.mkdir(baseDir, true);
      }
    });
  }

  findDirs(): Effect.Effect<string[], ConfigError | UnknownError, FileSystemService | PathServiceTag> {
    return Effect.gen(function* () {
      const pathService = yield* PathServiceTag;
      const fileSystem = yield* FileSystemService;

      const baseDir = pathService.baseSearchDir;

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
  }

  findDirsLegacy(): Effect.Effect<string[], ConfigError | UnknownError, PathServiceTag> {
    return Effect.gen(function* () {
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
  }
}

// Service tag for Effect Context system
export class DirectoryServiceTag extends Context.Tag("DirectoryService")<DirectoryServiceTag, DirectoryService>() {}

// Layer that provides DirectoryService with proper dependency injection
export const DirectoryServiceLive = Layer.succeed(DirectoryServiceTag, new DirectoryServiceImpl());
