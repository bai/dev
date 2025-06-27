import fs from "fs/promises";
import os from "os";
import path from "path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { CommandContext } from "~/lib/core/command-types";
import { cdCommand } from "~/commands/cd";

describe("CD Command", () => {
  let tempDir: string;
  let mockLogger: any;
  let mockConfig: any;
  let testContext: CommandContext;

  // Mock functions
  let findDirsSpy: any;
  let handleCdToPathSpy: any;
  let spawnSpy: any;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cd-test-"));

    // Create mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      success: vi.fn(),
      child: vi.fn(),
    };

    // Create mock config
    mockConfig = {
      get: vi.fn(),
      set: vi.fn(),
      has: vi.fn(),
      getAll: vi.fn(),
    };

    // Create base test context
    testContext = {
      args: {},
      options: {},
      command: {} as any,
      logger: mockLogger,
      config: mockConfig,
    };

    // Setup spies after dynamic import
    const findDirsModule = await import("~/lib/find-dirs");
    const handleCdToPathModule = await import("~/lib/handle-cd-to-path");

    findDirsSpy = vi.spyOn(findDirsModule, "findDirs");
    handleCdToPathSpy = vi.spyOn(handleCdToPathModule, "handleCdToPath");

    // Mock handleCdToPath to not exit the process
    handleCdToPathSpy.mockImplementation(() => {
      // Do nothing instead of exiting
    });
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }

    // Restore all mocks
    vi.restoreAllMocks();
  });

  describe("Command Definition", () => {
    test("should have correct command properties", () => {
      expect(cdCommand.name).toBe("cd");
      expect(cdCommand.description).toBe("Navigate to a directory in ~/src");
      expect(cdCommand.help).toContain("Interactive Mode");
      expect(cdCommand.help).toContain("Direct Mode");
      expect(cdCommand.arguments).toHaveLength(1);
      expect(cdCommand.arguments?.[0]?.name).toBe("folder_name");
      expect(cdCommand.arguments?.[0]?.required).toBe(false);
    });
  });

  describe("Direct CD Mode", () => {
    beforeEach(() => {
      // Mock directory structure: platform/org/repo format
      const testDirs = [
        "github.com/user1/project1",
        "github.com/user1/awesome-project",
        "gitlab.com/org2/project2",
        "github.com/user2/my-cool-app",
        "bitbucket.org/team/legacy-code",
      ];

      findDirsSpy.mockReturnValue(testDirs);
    });

    test("should find exact match directory", async () => {
      const context = {
        ...testContext,
        args: { folder_name: "project1" },
      };

      await cdCommand.exec(context);

      expect(handleCdToPathSpy).toHaveBeenCalledWith("github.com/user1/project1");
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test("should find fuzzy match directory", async () => {
      const context = {
        ...testContext,
        args: { folder_name: "awesome" },
      };

      await cdCommand.exec(context);

      expect(handleCdToPathSpy).toHaveBeenCalledWith("github.com/user1/awesome-project");
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test("should find partial match directory", async () => {
      const context = {
        ...testContext,
        args: { folder_name: "cool" },
      };

      await cdCommand.exec(context);

      expect(handleCdToPathSpy).toHaveBeenCalledWith("github.com/user2/my-cool-app");
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test("should throw error for non-existent folder", async () => {
      const context = {
        ...testContext,
        args: { folder_name: "non-existent-folder" },
      };

      await expect(cdCommand.exec(context)).rejects.toThrow("Folder 'non-existent-folder' not found");

      expect(handleCdToPathSpy).not.toHaveBeenCalled();
    });

    test("should throw error for whitespace-only folder name", async () => {
      const context = {
        ...testContext,
        args: { folder_name: "   " },
      };

      await expect(cdCommand.exec(context)).rejects.toThrow("Folder name for 'cd' command cannot be empty.");

      expect(handleCdToPathSpy).not.toHaveBeenCalled();
    });

    test("should handle no directories found", async () => {
      findDirsSpy.mockReturnValue([]);

      const context = {
        ...testContext,
        args: { folder_name: "any-folder" },
      };

      await expect(cdCommand.exec(context)).rejects.toThrow("Folder 'any-folder' not found");
    });
  });

  describe("Interactive CD Mode", () => {
    let mockProc: any;

    beforeEach(async () => {
      // Mock directory structure
      const testDirs = [
        "github.com/user1/project1",
        "github.com/user1/project2",
        "gitlab.com/org2/project3",
      ];

      findDirsSpy.mockReturnValue(testDirs);

      // Setup mock process
      mockProc = {
        stdin: {
          write: vi.fn().mockResolvedValue(undefined),
          end: vi.fn().mockResolvedValue(undefined),
        },
        stdout: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("github.com/user1/project1\n"));
            controller.close();
          },
        }),
        stderr: new ReadableStream(),
        exited: Promise.resolve(0),
      };

      // Mock Bun spawn function
      spawnSpy = vi.spyOn(Bun, "spawn");
      spawnSpy.mockReturnValue(mockProc);
    });

    test("should handle successful fzf selection", async () => {
      const context = {
        ...testContext,
        args: {}, // No folder_name triggers interactive mode
      };

      await cdCommand.exec(context);

      expect(spawnSpy).toHaveBeenCalledWith(["fzf"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });

      expect(mockProc.stdin.write).toHaveBeenCalledWith(
        "github.com/user1/project1\ngithub.com/user1/project2\ngitlab.com/org2/project3\n",
      );
      expect(mockProc.stdin.end).toHaveBeenCalled();
      expect(handleCdToPathSpy).toHaveBeenCalledWith("github.com/user1/project1");
    });

    test("should handle fzf cancellation (exit code 130)", async () => {
      mockProc.exited = Promise.resolve(130);

      const context = {
        ...testContext,
        args: {},
      };

      await cdCommand.exec(context);

      expect(handleCdToPathSpy).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test("should handle fzf no match (exit code 1)", async () => {
      mockProc.exited = Promise.resolve(1);

      const context = {
        ...testContext,
        args: {},
      };

      await cdCommand.exec(context);

      expect(handleCdToPathSpy).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test("should handle fzf error (unexpected exit code)", async () => {
      mockProc.exited = Promise.resolve(2);

      const context = {
        ...testContext,
        args: {},
      };

      await expect(cdCommand.exec(context)).rejects.toThrow("Error during fzf execution. Exit code: 2");

      expect(handleCdToPathSpy).not.toHaveBeenCalled();
    });

    test("should handle empty fzf output", async () => {
      mockProc.stdout = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(""));
          controller.close();
        },
      });

      const context = {
        ...testContext,
        args: {},
      };

      await cdCommand.exec(context);

      expect(handleCdToPathSpy).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test("should handle no directories found in interactive mode", async () => {
      findDirsSpy.mockReturnValue([]);

      const context = {
        ...testContext,
        args: {},
      };

      await cdCommand.exec(context);

      expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("No directories found"));
      expect(spawnSpy).not.toHaveBeenCalled();
      expect(handleCdToPathSpy).not.toHaveBeenCalled();
    });

    test("should stream large number of directories without command length issues", async () => {
      // Create many directories to test streaming
      const largeDirCount = 100; // Reduced for faster testing
      const largeDirs: string[] = [];

      for (let i = 0; i < largeDirCount; i++) {
        const dir = `github.com/user${i}/project-with-very-long-name-${i}`;
        largeDirs.push(dir);
      }

      findDirsSpy.mockReturnValue(largeDirs);

      const context = {
        ...testContext,
        args: {},
      };

      await cdCommand.exec(context);

      expect(spawnSpy).toHaveBeenCalledWith(["fzf"], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });

      // Verify all directories were written to stdin
      const expectedContent = largeDirs.join("\n") + "\n";
      expect(mockProc.stdin.write).toHaveBeenCalledWith(expectedContent);
      expect(mockProc.stdin.end).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    test("should propagate errors from direct cd", async () => {
      findDirsSpy.mockImplementation(() => {
        throw new Error("File system error");
      });

      const context = {
        ...testContext,
        args: { folder_name: "test" },
      };

      await expect(cdCommand.exec(context)).rejects.toThrow("File system error");
    });

    test("should propagate errors from interactive cd", async () => {
      findDirsSpy.mockImplementation(() => {
        throw new Error("Glob pattern error");
      });

      const context = {
        ...testContext,
        args: {},
      };

      await expect(cdCommand.exec(context)).rejects.toThrow("Glob pattern error");
    });
  });
});
