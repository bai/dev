import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { FileSystemTag, type FileSystem } from "~/capabilities/system/file-system-port";
import { DirectoryLiveLayer } from "~/capabilities/workspace/directory-live";
import { DirectoryTag } from "~/capabilities/workspace/directory-port";
import { fileSystemError } from "~/core/errors";
import { WorkspacePathsTag, type WorkspacePaths } from "~/core/runtime/path-service";

const makeWorkspacePaths = (baseSearchPath = "/home/user/dev"): WorkspacePaths => ({
  baseSearchPath,
});

const makeFileSystem = (overrides: Partial<FileSystem> = {}): FileSystem => ({
  exists: () => Effect.succeed(true),
  mkdir: () => Effect.void,
  readFile: () => Effect.succeed(""),
  writeFile: () => Effect.void,
  findDirectoriesGlob: () => Effect.succeed([]),
  getCwd: () => Effect.succeed("/current"),
  ...overrides,
});

const makeDeps = (fileSystem: FileSystem, workspacePaths = makeWorkspacePaths()) =>
  Layer.mergeAll(Layer.succeed(FileSystemTag, fileSystem), Layer.succeed(WorkspacePathsTag, workspacePaths));

const makeDirectory = (fileSystem: FileSystem, workspacePaths = makeWorkspacePaths()) =>
  Effect.gen(function* () {
    return yield* DirectoryTag;
  }).pipe(Effect.provide(Layer.provide(DirectoryLiveLayer, makeDeps(fileSystem, workspacePaths))));

describe("directory-live", () => {
  describe("DirectoryLiveLayer", () => {
    it.effect("creates a Directory implementation", () =>
      Effect.gen(function* () {
        const directory = yield* makeDirectory(makeFileSystem());

        expect(directory).toHaveProperty("ensureBaseDirectoryExists");
        expect(directory).toHaveProperty("findDirs");
        expect(typeof directory.ensureBaseDirectoryExists).toBe("function");
        expect(typeof directory.findDirs).toBe("function");
      }),
    );
  });

  describe("ensureBaseDirectoryExists", () => {
    it.effect("creates base directory when it does not exist", () =>
      Effect.gen(function* () {
        const workspacePaths = makeWorkspacePaths();
        const mkdirCalls: Array<{ readonly path: string; readonly recursive?: boolean }> = [];
        const fileSystem = makeFileSystem({
          exists: () => Effect.succeed(false),
          mkdir: (path, recursive) =>
            Effect.sync(() => {
              mkdirCalls.push({ path, recursive });
            }),
        });

        const directory = yield* makeDirectory(fileSystem, workspacePaths);
        yield* directory.ensureBaseDirectoryExists();

        expect(mkdirCalls).toEqual([{ path: "/home/user/dev", recursive: true }]);
      }),
    );

    it.effect("does not create base directory when it already exists", () =>
      Effect.gen(function* () {
        const workspacePaths = makeWorkspacePaths();
        let mkdirCalled = false;
        const fileSystem = makeFileSystem({
          exists: () => Effect.succeed(true),
          mkdir: () =>
            Effect.sync(() => {
              mkdirCalled = true;
            }),
        });

        const directory = yield* makeDirectory(fileSystem, workspacePaths);
        yield* directory.ensureBaseDirectoryExists();

        expect(mkdirCalled).toBe(false);
      }),
    );

    it.effect("propagates filesystem errors from mkdir", () =>
      Effect.gen(function* () {
        const workspacePaths = makeWorkspacePaths();
        const fileSystem = makeFileSystem({
          exists: () => Effect.succeed(false),
          mkdir: () => Effect.fail(fileSystemError("Permission denied", "/home/user/dev")),
        });

        const directory = yield* makeDirectory(fileSystem, workspacePaths);
        const error = yield* Effect.flip(directory.ensureBaseDirectoryExists());

        expect(error).toMatchObject({
          _tag: "FileSystemError",
          message: "Permission denied",
          path: "/home/user/dev",
        });
      }),
    );
  });

  describe("findDirs", () => {
    it.effect("returns empty list and creates base directory when missing", () =>
      Effect.gen(function* () {
        const workspacePaths = makeWorkspacePaths();
        const mkdirCalls: Array<{ readonly path: string; readonly recursive?: boolean }> = [];
        let findDirectoriesGlobCalls = 0;

        const fileSystem = makeFileSystem({
          exists: () => Effect.succeed(false),
          mkdir: (path, recursive) =>
            Effect.sync(() => {
              mkdirCalls.push({ path, recursive });
            }),
          findDirectoriesGlob: () =>
            Effect.sync(() => {
              findDirectoriesGlobCalls += 1;
              return [];
            }),
        });

        const directory = yield* makeDirectory(fileSystem, workspacePaths);
        const directories = yield* directory.findDirs();

        expect(directories).toEqual([]);
        expect(mkdirCalls).toEqual([{ path: "/home/user/dev", recursive: true }]);
        expect(findDirectoriesGlobCalls).toBe(0);
      }),
    );

    it.effect("returns directories from glob when base directory exists", () =>
      Effect.gen(function* () {
        const workspacePaths = makeWorkspacePaths();
        const expectedDirectories = ["/home/user/dev/github.com/org/repo/", "/home/user/dev/gitlab.com/org/project/"];
        let capturedBaseDir = "";
        let capturedPattern = "";

        const fileSystem = makeFileSystem({
          exists: () => Effect.succeed(true),
          findDirectoriesGlob: (baseDir, pattern) =>
            Effect.sync(() => {
              capturedBaseDir = baseDir;
              capturedPattern = pattern;
              return expectedDirectories;
            }),
        });

        const directory = yield* makeDirectory(fileSystem, workspacePaths);
        const directories = yield* directory.findDirs();

        expect(directories).toEqual(expectedDirectories);
        expect(capturedBaseDir).toBe("/home/user/dev");
        expect(capturedPattern).toBe("*/*/*/");
      }),
    );

    it.effect("propagates filesystem errors from findDirectoriesGlob", () =>
      Effect.gen(function* () {
        const workspacePaths = makeWorkspacePaths();
        const fileSystem = makeFileSystem({
          exists: () => Effect.succeed(true),
          findDirectoriesGlob: () => Effect.fail(fileSystemError("Glob search failed", "/home/user/dev")),
        });

        const directory = yield* makeDirectory(fileSystem, workspacePaths);
        const error = yield* Effect.flip(directory.findDirs());

        expect(error).toMatchObject({
          _tag: "FileSystemError",
          message: "Glob search failed",
          path: "/home/user/dev",
        });
      }),
    );
  });

  describe("DirectoryLiveLayer", () => {
    it.effect("provides Directory service via layer", () =>
      Effect.gen(function* () {
        const workspacePaths = makeWorkspacePaths();
        const fileSystem = makeFileSystem();

        const testLayer = DirectoryLiveLayer.pipe(Layer.provide(makeDeps(fileSystem, workspacePaths)));

        const directories = yield* Effect.gen(function* () {
          const directory = yield* DirectoryTag;
          return yield* directory.findDirs();
        }).pipe(Effect.provide(testLayer));

        expect(directories).toEqual([]);
      }),
    );
  });

  describe("integration scenarios", () => {
    it.effect("handles typical development directory structure", () =>
      Effect.gen(function* () {
        const expectedDirectories = [
          "/home/user/dev/github.com/myorg/frontend/",
          "/home/user/dev/github.com/myorg/backend/",
          "/home/user/dev/gitlab.com/company/project/",
        ];

        const workspacePaths = makeWorkspacePaths();
        const fileSystem = makeFileSystem({
          findDirectoriesGlob: () => Effect.succeed(expectedDirectories),
        });

        const directory = yield* makeDirectory(fileSystem, workspacePaths);
        const directories = yield* directory.findDirs();

        expect(directories).toEqual(expectedDirectories);
      }),
    );

    it.effect("handles empty development directory", () =>
      Effect.gen(function* () {
        const workspacePaths = makeWorkspacePaths();
        const fileSystem = makeFileSystem({
          findDirectoriesGlob: () => Effect.succeed([]),
        });

        const directory = yield* makeDirectory(fileSystem, workspacePaths);
        const directories = yield* directory.findDirs();

        expect(directories).toEqual([]);
      }),
    );
  });
});
