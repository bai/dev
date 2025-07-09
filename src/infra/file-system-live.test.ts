import fs from "fs/promises";
import fsSync from "fs";
import os from "os";
import path from "path";

import { it } from "@effect/vitest";
import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect } from "vitest";

import type { FileSystem } from "../domain/file-system-port";
import { makeFileSystemLive } from "./file-system-live";

// Mock Bun.Glob for testing since we're running in Node/Vitest
if (!globalThis.Bun) {
  globalThis.Bun = {
    Glob: class {
      constructor(private pattern: string) {}

      scanSync(options: { cwd: string }) {
        // Simple mock implementation for testing
        const entries = fsSync.readdirSync(options.cwd, { withFileTypes: true });
        const matches: string[] = [];

        for (const entry of entries) {
          if (this.pattern.includes("*")) {
            const regex = new RegExp("^" + this.pattern.replace(/\*/g, ".*") + "$");
            if (regex.test(entry.name)) {
              matches.push(entry.name);
            }
          }
        }

        // Handle ** patterns separately
        if (this.pattern.includes("**/")) {
          const searchPattern = this.pattern.replace("**/", "");
          function searchDir(dir: string, relPath = "") {
            const items = fsSync.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
              const itemPath = relPath ? `${relPath}/${item.name}` : item.name;
              if (item.isDirectory()) {
                if (item.name === searchPattern) {
                  matches.push(itemPath);
                }
                searchDir(path.join(dir, item.name), itemPath);
              }
            }
          }
          searchDir(options.cwd);
        }

        return matches;
      }
    },
  } as any;
}

describe("file-system-live", () => {
  const fileSystem: FileSystem = makeFileSystemLive();
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = path.join(os.tmpdir(), `fs-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up the temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("readFile", () => {
    it.effect("reads a file successfully", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "test.txt");
        const content = "Hello, World!";
        yield* Effect.promise(() => fs.writeFile(filePath, content));

        const result = yield* fileSystem.readFile(filePath);
        expect(result).toBe(content);
      }),
    );

    it.effect("fails when file does not exist", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "nonexistent.txt");

        const result = yield* Effect.flip(fileSystem.readFile(filePath));
        expect(result._tag).toBe("FileSystemError");
        expect(result.reason).toContain("Failed to read file");
        if (result._tag === "FileSystemError") {
          expect(result.path).toBe(filePath);
        }
      }),
    );
  });

  describe("writeFile", () => {
    it.effect("writes a file successfully", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "output.txt");
        const content = "Test content";

        yield* fileSystem.writeFile(filePath, content);

        const writtenContent = yield* Effect.promise(() => fs.readFile(filePath, "utf-8"));
        expect(writtenContent).toBe(content);
      }),
    );

    it.effect("creates parent directories when writing a file", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "nested", "dir", "file.txt");
        const content = "Nested content";

        yield* fileSystem.writeFile(filePath, content);

        const writtenContent = yield* Effect.promise(() => fs.readFile(filePath, "utf-8"));
        expect(writtenContent).toBe(content);
      }),
    );

    it.effect("overwrites existing file", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "overwrite.txt");
        yield* Effect.promise(() => fs.writeFile(filePath, "Original content"));

        const newContent = "New content";
        yield* fileSystem.writeFile(filePath, newContent);

        const writtenContent = yield* Effect.promise(() => fs.readFile(filePath, "utf-8"));
        expect(writtenContent).toBe(newContent);
      }),
    );
  });

  describe("exists", () => {
    it.effect("returns true for existing file", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "exists.txt");
        yield* Effect.promise(() => fs.writeFile(filePath, "content"));

        const result = yield* fileSystem.exists(filePath);
        expect(result).toBe(true);
      }),
    );

    it.effect("returns true for existing directory", () =>
      Effect.gen(function* () {
        const dirPath = path.join(tempDir, "subdir");
        yield* Effect.promise(() => fs.mkdir(dirPath));

        const result = yield* fileSystem.exists(dirPath);
        expect(result).toBe(true);
      }),
    );

    it.effect("returns false for non-existing path", () =>
      Effect.gen(function* () {
        const filePath = path.join(tempDir, "nonexistent.txt");

        const result = yield* fileSystem.exists(filePath);
        expect(result).toBe(false);
      }),
    );
  });

  describe("mkdir", () => {
    it.effect("creates a directory successfully", () =>
      Effect.gen(function* () {
        const dirPath = path.join(tempDir, "newdir");

        yield* fileSystem.mkdir(dirPath);

        const stats = yield* Effect.promise(() => fs.stat(dirPath));
        expect(stats.isDirectory()).toBe(true);
      }),
    );

    it.effect("creates nested directories with recursive=true", () =>
      Effect.gen(function* () {
        const dirPath = path.join(tempDir, "deep", "nested", "dir");

        yield* fileSystem.mkdir(dirPath, true);

        const stats = yield* Effect.promise(() => fs.stat(dirPath));
        expect(stats.isDirectory()).toBe(true);
      }),
    );

    it.effect("does not fail when directory already exists", () =>
      Effect.gen(function* () {
        const dirPath = path.join(tempDir, "existing");
        yield* Effect.promise(() => fs.mkdir(dirPath));

        // Should not throw when directory exists
        yield* fileSystem.mkdir(dirPath);

        const stats = yield* Effect.promise(() => fs.stat(dirPath));
        expect(stats.isDirectory()).toBe(true);
      }),
    );
  });

  describe("findDirectoriesGlob", () => {
    it.effect("finds directories matching glob pattern", () =>
      Effect.gen(function* () {
        // Create test directory structure
        yield* Effect.promise(() => fs.mkdir(path.join(tempDir, "project1"), { recursive: true }));
        yield* Effect.promise(() => fs.mkdir(path.join(tempDir, "project2"), { recursive: true }));
        yield* Effect.promise(() => fs.mkdir(path.join(tempDir, "other"), { recursive: true }));
        yield* Effect.promise(() => fs.writeFile(path.join(tempDir, "project3.txt"), "not a directory"));

        const result = yield* fileSystem.findDirectoriesGlob(tempDir, "project*");

        expect(result).toContain("project1");
        expect(result).toContain("project2");
        expect(result).toContain("project3.txt"); // Glob includes files too
        expect(result).not.toContain("other");
      }),
    );

    it.effect("returns empty array when no matches found", () =>
      Effect.gen(function* () {
        const result = yield* fileSystem.findDirectoriesGlob(tempDir, "nonexistent*");
        expect(result).toEqual([]);
      }),
    );

    it.effect("handles nested glob patterns", () =>
      Effect.gen(function* () {
        // Create nested structure
        yield* Effect.promise(() => fs.mkdir(path.join(tempDir, "src", "components"), { recursive: true }));
        yield* Effect.promise(() => fs.mkdir(path.join(tempDir, "src", "utils"), { recursive: true }));
        yield* Effect.promise(() => fs.mkdir(path.join(tempDir, "test", "components"), { recursive: true }));

        const result = yield* fileSystem.findDirectoriesGlob(tempDir, "**/components");

        expect(result).toContain("src/components");
        expect(result).toContain("test/components");
        expect(result).not.toContain("src/utils");
      }),
    );
  });

  describe("getCwd", () => {
    it.effect("returns current working directory", () =>
      Effect.gen(function* () {
        const result = yield* fileSystem.getCwd();
        expect(result).toBe(process.cwd());
      }),
    );
  });

  describe("resolvePath", () => {
    it("expands tilde to home directory", () => {
      const result = fileSystem.resolvePath("~/test");
      expect(result).toBe(path.join(os.homedir(), "test"));
    });

    it("resolves relative paths", () => {
      const result = fileSystem.resolvePath("./test");
      expect(result).toBe(path.resolve("./test"));
    });

    it("returns absolute paths unchanged", () => {
      const absolutePath = "/tmp/test";
      const result = fileSystem.resolvePath(absolutePath);
      expect(result).toBe(absolutePath);
    });

    it("resolves complex paths with tilde", () => {
      const result = fileSystem.resolvePath("~/projects/../documents");
      expect(result).toBe(path.join(os.homedir(), "documents"));
    });
  });
});
