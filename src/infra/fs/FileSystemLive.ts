import fs from "fs/promises";
import os from "os";
import path from "path";

import { Effect, Layer } from "effect";

import { configError, unknownError, type ConfigError, type UnknownError } from "../../domain/errors";
import { FileSystemService, type FileSystem } from "../../domain/ports/FileSystem";

export class FileSystemLive implements FileSystem {
  readFile(filePath: string): Effect.Effect<string, ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: () => fs.readFile(filePath, "utf-8"),
      catch: (error) => configError(`Failed to read file ${filePath}: ${error}`),
    });
  }

  writeFile(filePath: string, content: string): Effect.Effect<void, ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const dir = path.dirname(filePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, content, "utf-8");
      },
      catch: (error) => configError(`Failed to write file ${filePath}: ${error}`),
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

  mkdir(dirPath: string, recursive = true): Effect.Effect<void, ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: () => fs.mkdir(dirPath, { recursive }),
      catch: (error) => configError(`Failed to create directory ${dirPath}: ${error}`),
    });
  }

  listDirectories(dirPath: string): Effect.Effect<string[], ConfigError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const scanner = new Bun.Glob("*/*/*/");
        const matches = Array.from(scanner.scanSync({ cwd: dirPath, onlyFiles: false }));
        return matches;
      },
      catch: (error) => configError(`Failed to list directories in ${dirPath}: ${error}`),
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
