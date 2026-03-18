import { Effect } from "effect";

import type { FileSystemService } from "~/capabilities/system/file-system-port";

export class FileSystemMock implements FileSystemService {
  public readonly existingPaths = new Set<string>();
  public readonly existsCalls: string[] = [];
  public readonly mkdirCalls: Array<{ readonly path: string; readonly recursive?: boolean }> = [];
  public readonly readFileContents = new Map<string, string>();
  public readonly writeFileCalls: Array<{ readonly path: string; readonly content: string }> = [];

  readFile(path: string): Effect.Effect<string, never> {
    return Effect.succeed(this.readFileContents.get(path) ?? "");
  }

  writeFile(path: string, content: string): Effect.Effect<void, never> {
    this.writeFileCalls.push({ path, content });
    this.existingPaths.add(path);
    this.readFileContents.set(path, content);
    return Effect.void;
  }

  exists(path: string): Effect.Effect<boolean, never> {
    this.existsCalls.push(path);
    return Effect.succeed(this.existingPaths.has(path));
  }

  mkdir(path: string, recursive?: boolean): Effect.Effect<void, never> {
    this.mkdirCalls.push({ path, recursive });
    this.existingPaths.add(path);
    return Effect.void;
  }

  findDirectoriesGlob(_basePath: string, _pattern: string): Effect.Effect<string[], never> {
    return Effect.succeed([]);
  }

  getCwd(): Effect.Effect<string, never> {
    return Effect.succeed("/tmp");
  }
}
