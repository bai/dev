import fs from "fs/promises";
import path from "path";

import { ATTR_FILE_PATH } from "@opentelemetry/semantic-conventions/incubating";
import { Effect, Layer } from "effect";

import { FileSystemTag, type FileSystem } from "~/capabilities/system/file-system-port";
import { fileSystemError, type FileSystemError, type UnknownError } from "~/core/errors";
import { annotateErrorTypeOnFailure } from "~/core/observability/error-type";

// Individual functions for each method
const readFile = (filePath: string): Effect.Effect<string, FileSystemError | UnknownError> =>
  Effect.tryPromise({
    try: () => fs.readFile(filePath, "utf-8"),
    catch: (error) => fileSystemError(`Failed to read file ${filePath}: ${error}`, filePath),
  }).pipe(annotateErrorTypeOnFailure, Effect.withSpan("fs.read_file", { attributes: { [ATTR_FILE_PATH]: filePath } }));

const writeFile = (filePath: string, content: string): Effect.Effect<void, FileSystemError | UnknownError> =>
  Effect.tryPromise({
    try: async () => {
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");
    },
    catch: (error) => fileSystemError(`Failed to write file ${filePath}: ${error}`, filePath),
  }).pipe(annotateErrorTypeOnFailure, Effect.withSpan("fs.write_file", { attributes: { [ATTR_FILE_PATH]: filePath } }));

const exists = (filePath: string): Effect.Effect<boolean> =>
  Effect.tryPromise({
    try: () => fs.access(filePath).then(() => true),
    catch: (_error) => false,
  }).pipe(
    Effect.orElseSucceed(() => false),
    Effect.withSpan("fs.exists", { attributes: { [ATTR_FILE_PATH]: filePath } }),
  );

const mkdir = (dirPath: string, recursive = true): Effect.Effect<void, FileSystemError | UnknownError> =>
  Effect.tryPromise({
    try: () => fs.mkdir(dirPath, { recursive }),
    catch: (error) => fileSystemError(`Failed to create directory ${dirPath}: ${error}`, dirPath),
  }).pipe(annotateErrorTypeOnFailure, Effect.withSpan("fs.mkdir", { attributes: { [ATTR_FILE_PATH]: dirPath } }));

const findDirectoriesGlob = (basePath: string, pattern: string): Effect.Effect<string[], FileSystemError | UnknownError> =>
  Effect.tryPromise({
    try: async () => {
      const scanner = new Bun.Glob(pattern);
      const matches = Array.from(scanner.scanSync({ cwd: basePath, onlyFiles: false }));
      return matches;
    },
    catch: (error) => fileSystemError(`Failed to find directories with pattern ${pattern} in ${basePath}: ${error}`, basePath),
  }).pipe(
    annotateErrorTypeOnFailure,
    Effect.withSpan("fs.find_directories_glob", { attributes: { [ATTR_FILE_PATH]: basePath, "fs.glob_pattern": pattern } }),
  );

const getCwd = (): Effect.Effect<string> => Effect.sync(() => process.cwd());

// Factory function to create FileSystem implementation
export const makeFileSystemLive = (): FileSystem => ({
  readFile,
  writeFile,
  exists,
  mkdir,
  findDirectoriesGlob,
  getCwd,
});

// Effect Layer for dependency injection with proper resource management
export const FileSystemLiveLayer = Layer.succeed(FileSystemTag, makeFileSystemLive());
