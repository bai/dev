import fs from "fs/promises";
import os from "os";
import path from "path";

import { Effect, Layer } from "effect";

import { fileSystemError, unknownError, type FileSystemError, type UnknownError } from "../../domain/errors";
import { FileSystemService, type FileSystem } from "../../domain/ports/FileSystem";

export class FileSystemLive implements FileSystem {
  readFile(filePath: string): Effect.Effect<string, FileSystemError | UnknownError> {
    return Effect.tryPromise({
      try: () => fs.readFile(filePath, "utf-8"),
      catch: (error) => fileSystemError(`Failed to read file ${filePath}: ${error}`, filePath),
    });
  }

  writeFile(filePath: string, content: string): Effect.Effect<void, FileSystemError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, content, "utf-8");
      },
      catch: (error) => fileSystemError(`Failed to write file ${filePath}: ${error}`, filePath),
    });
  }

  exists(filePath: string): Effect.Effect<boolean> {
    return Effect.promise(() =>
      fs
        .access(filePath)
        .then(() => true)
        .catch(() => false),
    );
  }

  mkdir(dirPath: string, recursive = true): Effect.Effect<void, FileSystemError | UnknownError> {
    return Effect.tryPromise({
      try: () => fs.mkdir(dirPath, { recursive }),
      catch: (error) => fileSystemError(`Failed to create directory ${dirPath}: ${error}`, dirPath),
    });
  }

  listDirectories(dirPath: string): Effect.Effect<string[], FileSystemError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const scanner = new Bun.Glob("*/");
        const matches = Array.from(scanner.scanSync({ cwd: dirPath, onlyFiles: false }));
        return matches.map((match) => match.replace(/\/$/, "")); // Remove trailing slash
      },
      catch: (error) => fileSystemError(`Failed to list directories in ${dirPath}: ${error}`, dirPath),
    });
  }

  getCwd(): Effect.Effect<string> {
    return Effect.sync(() => process.cwd());
  }

  resolvePath(filePath: string): string {
    if (filePath.startsWith("~")) {
      return path.join(os.homedir(), filePath.slice(1));
    }
    return path.resolve(filePath);
  }
}

// Effect Layer for dependency injection
export const FileSystemLiveLayer = Layer.succeed(FileSystemService, new FileSystemLive());
