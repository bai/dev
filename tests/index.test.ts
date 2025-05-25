import fs from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

describe("Integration Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-test-"));
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("File System Operations", () => {
    test("should handle directory structure creation", async () => {
      const projectStructure = [
        "src/github.com/org/project1",
        "src/github.com/org/project2",
        "src/gitlab.com/another-org/project3",
      ];

      // Create the directory structure
      for (const dir of projectStructure) {
        await fs.mkdir(path.join(tempDir, dir), { recursive: true });
      }

      // Verify directories were created
      for (const dir of projectStructure) {
        const fullPath = path.join(tempDir, dir);
        const stats = await fs.stat(fullPath);
        expect(stats.isDirectory()).toBe(true);
      }
    });
  });
});
