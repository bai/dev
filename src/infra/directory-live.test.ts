import { it } from "@effect/vitest";
import { describe, expect } from "vitest";
import { Effect, Layer } from "effect";

import { DirectoryTag, type Directory } from "../domain/directory-port";
import { FileSystemError, fileSystemError } from "../domain/errors";
import { type FileSystem, FileSystemTag } from "../domain/file-system-port";
import { type PathService, PathServiceTag } from "../domain/path-service";
import { makeDirectoryLive, DirectoryLiveLayer } from "./directory-live";

describe("directory-live", () => {
  describe("makeDirectoryLive", () => {
    it("creates a Directory implementation", () => {
      const directory = makeDirectoryLive();
      
      expect(directory).toHaveProperty("ensureBaseDirectoryExists");
      expect(directory).toHaveProperty("findDirs");
      expect(typeof directory.ensureBaseDirectoryExists).toBe("function");
      expect(typeof directory.findDirs).toBe("function");
    });
  });

  describe("ensureBaseDirectoryExists", () => {
    it.effect("creates base directory when it doesn't exist", () =>
      Effect.gen(function* () {
        const mockFileSystem: FileSystem = {
          exists: () => Effect.succeed(false),
          mkdir: () => Effect.succeed(undefined),
          readFile: () => Effect.fail(fileSystemError("Not implemented")),
          writeFile: () => Effect.fail(fileSystemError("Not implemented")),
          findDirectoriesGlob: () => Effect.fail(fileSystemError("Not implemented")),
          getCwd: () => Effect.succeed("/current"),
          resolvePath: (p: string) => Effect.succeed(p),
        };

        const mockPathService: PathService = {
          homeDir: "/home/user",
          baseSearchPath: "/home/user/dev",
          devDir: "/home/user/.dev",
          configDir: "/home/user/.config/dev",
          configPath: "/home/user/.config/dev/config.json",
          dataDir: "/home/user/.local/share/dev",
          dbPath: "/home/user/.local/share/dev/dev.db",
          cacheDir: "/home/user/.cache/dev",
          getBasePath: () => "/home/user/dev",
        };

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, mockFileSystem),
          Layer.succeed(PathServiceTag, mockPathService)
        );

        const directory = makeDirectoryLive();
        const result = yield* directory.ensureBaseDirectoryExists().pipe(Effect.provide(testLayer));

        expect(result).toBeUndefined();
      })
    );

    it.effect("does not create directory when it already exists", () =>
      Effect.gen(function* () {
        let mkdirCalled = false;
        
        const mockFileSystem: FileSystem = {
          exists: () => Effect.succeed(true),
          mkdir: () => Effect.gen(function* () {
            mkdirCalled = true;
            return undefined;
          }),
          readFile: () => Effect.fail(fileSystemError("Not implemented")),
          writeFile: () => Effect.fail(fileSystemError("Not implemented")),
          findDirectoriesGlob: () => Effect.fail(fileSystemError("Not implemented")),
          getCwd: () => Effect.succeed("/current"),
          resolvePath: (p: string) => Effect.succeed(p),
        };

        const mockPathService: PathService = {
          homeDir: "/home/user",
          baseSearchPath: "/home/user/dev",
          devDir: "/home/user/.dev",
          configDir: "/home/user/.config/dev",
          configPath: "/home/user/.config/dev/config.json",
          dataDir: "/home/user/.local/share/dev",
          dbPath: "/home/user/.local/share/dev/dev.db",
          cacheDir: "/home/user/.cache/dev",
          getBasePath: () => "/home/user/dev",
        };

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, mockFileSystem),
          Layer.succeed(PathServiceTag, mockPathService)
        );

        const directory = makeDirectoryLive();
        const result = yield* directory.ensureBaseDirectoryExists().pipe(Effect.provide(testLayer));

        expect(result).toBeUndefined();
        expect(mkdirCalled).toBe(false);
      })
    );

    it.effect("propagates filesystem errors", () =>
      Effect.gen(function* () {
        const mockFileSystem: FileSystem = {
          exists: () => Effect.fail(fileSystemError("Permission denied", "/home/user/dev")),
          mkdir: () => Effect.succeed(undefined),
          readFile: () => Effect.fail(fileSystemError("Not implemented")),
          writeFile: () => Effect.fail(fileSystemError("Not implemented")),
          findDirectoriesGlob: () => Effect.fail(fileSystemError("Not implemented")),
          getCwd: () => Effect.succeed("/current"),
          resolvePath: (p: string) => Effect.succeed(p),
        };

        const mockPathService: PathService = {
          homeDir: "/home/user",
          baseSearchPath: "/home/user/dev",
          devDir: "/home/user/.dev",
          configDir: "/home/user/.config/dev",
          configPath: "/home/user/.config/dev/config.json",
          dataDir: "/home/user/.local/share/dev",
          dbPath: "/home/user/.local/share/dev/dev.db",
          cacheDir: "/home/user/.cache/dev",
          getBasePath: () => "/home/user/dev",
        };

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, mockFileSystem),
          Layer.succeed(PathServiceTag, mockPathService)
        );

        const directory = makeDirectoryLive();
        
        const result = yield* Effect.flip(
          directory.ensureBaseDirectoryExists().pipe(Effect.provide(testLayer))
        );
        
        expect(result).toEqual(fileSystemError("Permission denied", "/home/user/dev"));
      })
    );
  });

  describe("findDirs", () => {
    it.effect("returns empty array when base directory doesn't exist and creates it", () =>
      Effect.gen(function* () {
        const mockFileSystem: FileSystem = {
          exists: () => Effect.succeed(false),
          mkdir: () => Effect.succeed(undefined),
          readFile: () => Effect.fail(fileSystemError("Not implemented")),
          writeFile: () => Effect.fail(fileSystemError("Not implemented")),
          findDirectoriesGlob: () => Effect.succeed([]),
          getCwd: () => Effect.succeed("/current"),
          resolvePath: (p: string) => Effect.succeed(p),
        };

        const mockPathService: PathService = {
          homeDir: "/home/user",
          baseSearchPath: "/home/user/dev",
          devDir: "/home/user/.dev",
          configDir: "/home/user/.config/dev",
          configPath: "/home/user/.config/dev/config.json",
          dataDir: "/home/user/.local/share/dev",
          dbPath: "/home/user/.local/share/dev/dev.db",
          cacheDir: "/home/user/.cache/dev",
          getBasePath: () => "/home/user/dev",
        };

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, mockFileSystem),
          Layer.succeed(PathServiceTag, mockPathService)
        );

        const directory = makeDirectoryLive();
        const result = yield* directory.findDirs().pipe(Effect.provide(testLayer));

        expect(result).toEqual([]);
      })
    );

    it.effect("returns directories when base directory exists", () =>
      Effect.gen(function* () {
        const expectedDirs = [
        "/home/user/dev/github.com/org/repo/",
        "/home/user/dev/gitlab.com/org/project/",
      ];

      const mockFileSystem: FileSystem = {
        exists: () => Effect.succeed(true),
        mkdir: () => Effect.succeed(undefined),
        readFile: () => Effect.fail(fileSystemError("Not implemented")),
        writeFile: () => Effect.fail(fileSystemError("Not implemented")),
        findDirectoriesGlob: () => Effect.succeed(expectedDirs),
        getCwd: () => Effect.succeed("/current"),
        resolvePath: (p: string) => Effect.succeed(p),
      };

      const mockPathService: PathService = {
        homeDir: "/home/user",
        baseSearchPath: "/home/user/dev",
        devDir: "/home/user/.dev",
        configDir: "/home/user/.config/dev",
        configPath: "/home/user/.config/dev/config.json",
        dataDir: "/home/user/.local/share/dev",
        dbPath: "/home/user/.local/share/dev/dev.db",
        cacheDir: "/home/user/.cache/dev",
        getBasePath: () => "/home/user/dev",
      };

      const testLayer = Layer.mergeAll(
        Layer.succeed(FileSystemTag, mockFileSystem),
        Layer.succeed(PathServiceTag, mockPathService)
      );

        const directory = makeDirectoryLive();
        const result = yield* directory.findDirs().pipe(Effect.provide(testLayer));

        expect(result).toEqual(expectedDirs);
      })
    );

    it.effect("uses correct glob pattern for 3-level deep directories", () =>
      Effect.gen(function* () {
        let capturedGlob = "";
        let capturedBaseDir = "";

        const mockFileSystem: FileSystem = {
        exists: () => Effect.succeed(true),
        mkdir: () => Effect.succeed(undefined),
        readFile: () => Effect.fail(fileSystemError("Not implemented")),
        writeFile: () => Effect.fail(fileSystemError("Not implemented")),
        findDirectoriesGlob: (baseDir: string, pattern: string) => Effect.gen(function* () {
          capturedBaseDir = baseDir;
          capturedGlob = pattern;
          return [];
        }),
        getCwd: () => Effect.succeed("/current"),
        resolvePath: (p: string) => Effect.succeed(p),
      };

      const mockPathService: PathService = {
        homeDir: "/home/user",
        baseSearchPath: "/home/user/dev",
        devDir: "/home/user/.dev",
        configDir: "/home/user/.config/dev",
        configPath: "/home/user/.config/dev/config.json",
        dataDir: "/home/user/.local/share/dev",
        dbPath: "/home/user/.local/share/dev/dev.db",
        cacheDir: "/home/user/.cache/dev",
        getBasePath: () => "/home/user/dev",
      };

      const testLayer = Layer.mergeAll(
        Layer.succeed(FileSystemTag, mockFileSystem),
        Layer.succeed(PathServiceTag, mockPathService)
      );

        const directory = makeDirectoryLive();
        yield* directory.findDirs().pipe(Effect.provide(testLayer));

        expect(capturedBaseDir).toBe("/home/user/dev");
        expect(capturedGlob).toBe("*/*/*/");
      })
    );

    it.effect("propagates filesystem errors from exists check", () =>
      Effect.gen(function* () {
        const mockFileSystem: FileSystem = {
          exists: () => Effect.fail(fileSystemError("Permission denied", "/home/user/dev")),
          mkdir: () => Effect.succeed(undefined),
          readFile: () => Effect.fail(fileSystemError("Not implemented")),
          writeFile: () => Effect.fail(fileSystemError("Not implemented")),
          findDirectoriesGlob: () => Effect.succeed([]),
          getCwd: () => Effect.succeed("/current"),
          resolvePath: (p: string) => Effect.succeed(p),
        };

        const mockPathService: PathService = {
          homeDir: "/home/user",
          baseSearchPath: "/home/user/dev",
          devDir: "/home/user/.dev",
          configDir: "/home/user/.config/dev",
          configPath: "/home/user/.config/dev/config.json",
          dataDir: "/home/user/.local/share/dev",
          dbPath: "/home/user/.local/share/dev/dev.db",
          cacheDir: "/home/user/.cache/dev",
          getBasePath: () => "/home/user/dev",
        };

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, mockFileSystem),
          Layer.succeed(PathServiceTag, mockPathService)
        );

        const directory = makeDirectoryLive();
        
        const result = yield* Effect.flip(
          directory.findDirs().pipe(Effect.provide(testLayer))
        );
        
        expect(result).toEqual(fileSystemError("Permission denied", "/home/user/dev"));
      })
    );

    it.effect("propagates filesystem errors from glob search", () =>
      Effect.gen(function* () {
        const mockFileSystem: FileSystem = {
          exists: () => Effect.succeed(true),
          mkdir: () => Effect.succeed(undefined),
          readFile: () => Effect.fail(fileSystemError("Not implemented")),
          writeFile: () => Effect.fail(fileSystemError("Not implemented")),
          findDirectoriesGlob: () => Effect.fail(fileSystemError("Glob search failed")),
          getCwd: () => Effect.succeed("/current"),
          resolvePath: (p: string) => Effect.succeed(p),
        };

        const mockPathService: PathService = {
          homeDir: "/home/user",
          baseSearchPath: "/home/user/dev",
          devDir: "/home/user/.dev",
          configDir: "/home/user/.config/dev",
          configPath: "/home/user/.config/dev/config.json",
          dataDir: "/home/user/.local/share/dev",
          dbPath: "/home/user/.local/share/dev/dev.db",
          cacheDir: "/home/user/.cache/dev",
          getBasePath: () => "/home/user/dev",
        };

        const testLayer = Layer.mergeAll(
          Layer.succeed(FileSystemTag, mockFileSystem),
          Layer.succeed(PathServiceTag, mockPathService)
        );

        const directory = makeDirectoryLive();
        
        const result = yield* Effect.flip(
          directory.findDirs().pipe(Effect.provide(testLayer))
        );
        
        expect(result).toEqual(fileSystemError("Glob search failed"));
      })
    );
  });

  describe("DirectoryLiveLayer", () => {
    it.effect("provides Directory service via layer", () =>
      Effect.gen(function* () {
      const mockFileSystem: FileSystem = {
        exists: () => Effect.succeed(true),
        mkdir: () => Effect.succeed(undefined),
        readFile: () => Effect.fail(fileSystemError("Not implemented")),
        writeFile: () => Effect.fail(fileSystemError("Not implemented")),
        findDirectoriesGlob: () => Effect.succeed([]),
        getCwd: () => Effect.succeed("/current"),
        resolvePath: (p: string) => Effect.succeed(p),
      };

      const mockPathService: PathService = {
        homeDir: "/home/user",
        baseSearchPath: "/home/user/dev",
        devDir: "/home/user/.dev",
        configDir: "/home/user/.config/dev",
        configPath: "/home/user/.config/dev/config.json",
        dataDir: "/home/user/.local/share/dev",
        dbPath: "/home/user/.local/share/dev/dev.db",
        cacheDir: "/home/user/.cache/dev",
        getBasePath: () => "/home/user/dev",
      };

      const testLayer = Layer.mergeAll(
        Layer.succeed(FileSystemTag, mockFileSystem),
        Layer.succeed(PathServiceTag, mockPathService),
        DirectoryLiveLayer
      );

        const program = Effect.gen(function* () {
          const directory = yield* DirectoryTag;
          return yield* directory.findDirs();
        });

        const result = yield* program.pipe(Effect.provide(testLayer));
        expect(result).toEqual([]);
      })
    );
  });

  describe("integration scenarios", () => {
    it.effect("handles typical development directory structure", () =>
      Effect.gen(function* () {
      const mockDirs = [
        "/home/user/dev/github.com/myorg/frontend/",
        "/home/user/dev/github.com/myorg/backend/",
        "/home/user/dev/gitlab.com/company/project/",
      ];

      const mockFileSystem: FileSystem = {
        exists: () => Effect.succeed(true),
        mkdir: () => Effect.succeed(undefined),
        readFile: () => Effect.fail(fileSystemError("Not implemented")),
        writeFile: () => Effect.fail(fileSystemError("Not implemented")),
        findDirectoriesGlob: () => Effect.succeed(mockDirs),
        getCwd: () => Effect.succeed("/current"),
        resolvePath: (p: string) => Effect.succeed(p),
      };

      const mockPathService: PathService = {
        homeDir: "/home/user",
        baseSearchPath: "/home/user/dev",
        devDir: "/home/user/.dev",
        configDir: "/home/user/.config/dev",
        configPath: "/home/user/.config/dev/config.json",
        dataDir: "/home/user/.local/share/dev",
        dbPath: "/home/user/.local/share/dev/dev.db",
        cacheDir: "/home/user/.cache/dev",
        getBasePath: () => "/home/user/dev",
      };

      const testLayer = Layer.mergeAll(
        Layer.succeed(FileSystemTag, mockFileSystem),
        Layer.succeed(PathServiceTag, mockPathService)
      );

        const directory = makeDirectoryLive();
        const result = yield* directory.findDirs().pipe(Effect.provide(testLayer));

        expect(result).toEqual(mockDirs);
      })
    );

    it.effect("handles empty development directory", () =>
      Effect.gen(function* () {
      const mockFileSystem: FileSystem = {
        exists: () => Effect.succeed(true),
        mkdir: () => Effect.succeed(undefined),
        readFile: () => Effect.fail(fileSystemError("Not implemented")),
        writeFile: () => Effect.fail(fileSystemError("Not implemented")),
        findDirectoriesGlob: () => Effect.succeed([]),
        getCwd: () => Effect.succeed("/current"),
        resolvePath: (p: string) => Effect.succeed(p),
      };

      const mockPathService: PathService = {
        homeDir: "/home/user",
        baseSearchPath: "/home/user/dev",
        devDir: "/home/user/.dev",
        configDir: "/home/user/.config/dev",
        configPath: "/home/user/.config/dev/config.json",
        dataDir: "/home/user/.local/share/dev",
        dbPath: "/home/user/.local/share/dev/dev.db",
        cacheDir: "/home/user/.cache/dev",
        getBasePath: () => "/home/user/dev",
      };

      const testLayer = Layer.mergeAll(
        Layer.succeed(FileSystemTag, mockFileSystem),
        Layer.succeed(PathServiceTag, mockPathService)
      );

        const directory = makeDirectoryLive();
        const result = yield* directory.findDirs().pipe(Effect.provide(testLayer));

        expect(result).toEqual([]);
      })
    );
  });

});