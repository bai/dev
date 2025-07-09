import fs from "fs/promises";
import os from "os";
import path from "path";

import { Effect, Layer } from "effect";

import { fileSystemError, type FileSystemError, type UnknownError } from "../domain/errors";
import { FileSystemTag, type FileSystem } from "../domain/file-system-port";

// Individual functions for each method
const readFile = (filePath: string): Effect.Effect<string, FileSystemError | UnknownError> =>
  Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf-8"),
    catch: (error) => fileSystemError(`Failed to read file ${filePath}: ${error}`, filePath),
  });

const writeFile = (filePath: string, content: string): Effect.Effect<void, FileSystemError | UnknownError> =>
  Effect.tryPromise({
    try: async () => {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
    },
    catch: (error) => fileSystemError(`Failed to write file ${filePath}: ${error}`, filePath),
  });

const exists = (filePath: string): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: () => fs.access(filePath).then(() => true),
    catch: (_error) => false,
  }).pipe(Effect.orElseSucceed(() => false));

const mkdir = (dirPath: string, recursive = true): Effect.Effect<void, FileSystemError | UnknownError> =>
  Effect.tryPromise({
    try: () => fs.mkdir(dirPath, { recursive }),
    catch: (error) => fileSystemError(`Failed to create directory ${dirPath}: ${error}`, dirPath),
  });

const findDirectoriesGlob = (
  basePath: string,
  pattern: string,
): Effect.Effect<string[], FileSystemError | UnknownError> =>
  Effect.tryPromise({
    try: async () => {
      const scanner = new Bun.Glob(pattern);
      const matches = Array.from(scanner.scanSync({ cwd: basePath, onlyFiles: false }));
      return matches;
    },
    catch: (error) =>
      fileSystemError(`Failed to find directories with pattern ${pattern} in ${basePath}: ${error}`, basePath),
  });

const getCwd = (): Effect.Effect<string> => Effect.sync(() => process.cwd());

const resolvePath = (filePath: string): string => {
  if (filePath.startsWith("~/")) {
    return path.join(os.homedir(), filePath.slice(2));
  }
  if (filePath === "~") {
    return os.homedir();
  }
  return path.resolve(filePath);
};

// Factory function to create FileSystem implementation
export const makeFileSystemLive = (): FileSystem => ({
  readFile,
  writeFile,
  exists,
  mkdir,
  findDirectoriesGlob,
  getCwd,
  resolvePath,
});

// Effect Layer for dependency injection with proper resource management
export const FileSystemLiveLayer = Layer.effect(FileSystemTag, Effect.succeed(makeFileSystemLive()));
