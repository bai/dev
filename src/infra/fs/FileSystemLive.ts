import fs from "fs/promises";
import os from "os";
import path from "path";

import { Effect, Layer } from "effect";

import { fileSystemError, type FileSystemError, type UnknownError } from "../../domain/errors";
import { FileSystemService, type FileSystem } from "../../domain/ports/FileSystem";

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
  if (filePath.startsWith("~")) {
    return path.join(os.homedir(), filePath.slice(1));
  }
  return path.resolve(filePath);
};

// Plain object implementation
export const FileSystemLiveImpl: FileSystem = {
  readFile,
  writeFile,
  exists,
  mkdir,
  findDirectoriesGlob,
  getCwd,
  resolvePath,
};

// Effect Layer for dependency injection
export const FileSystemLiveLayer = Layer.succeed(FileSystemService, FileSystemLiveImpl);
