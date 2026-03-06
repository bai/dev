import fs from "fs/promises";
import os from "os";
import path from "path";

import { it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Ref } from "effect";
import { describe, expect } from "vitest";

import { makeFileSystemLive } from "~/capabilities/system/file-system-live";
import { FileSystemTag } from "~/capabilities/system/file-system-port";
import { GitMock } from "~/capabilities/system/git-mock";
import { GitTag } from "~/capabilities/system/git-port";
import type { Network } from "~/capabilities/system/network-port";
import { ShellMock } from "~/capabilities/system/shell-mock";
import { ShellTag } from "~/capabilities/system/shell-port";
import type { ManagedTool, ToolManagement, ToolManager } from "~/capabilities/tools/tool-management-port";
import { ToolManagementTag } from "~/capabilities/tools/tool-management-port";
import { makeConfigLoaderLive } from "~/core/config/config-loader-live";
import { gitError, shellExecutionError } from "~/core/errors";
import { makeHostPathsMock } from "~/core/runtime/path-service-mock";
import { checkTool, ensureCorrectConfigUrl, selfUpdateCli, upgradeEssentialTools } from "~/features/upgrade/upgrade-command";

const unusedNetwork: Network = {
  get: () => Effect.die("Network should not be used in this test"),
  downloadFile: () => Effect.die("Network should not be used in this test"),
  checkConnectivity: () => Effect.succeed(true),
};

const createManagedTool = (id: string, displayName: string, manager: ToolManager): ManagedTool => ({
  id,
  displayName,
  essential: true,
  manager,
});

describe("upgrade-command", () => {
  describe("ensureCorrectConfigUrl", () => {
    it.effect("parses JSONC in project and local config files", () =>
      Effect.gen(function* () {
        const tempDir = path.join(os.tmpdir(), `upgrade-command-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        yield* Effect.promise(() => fs.mkdir(tempDir, { recursive: true }));

        const devDir = path.join(tempDir, ".dev");
        const configDir = path.join(tempDir, ".config", "dev");
        const configPath = path.join(configDir, "config.json");

        yield* Effect.promise(() => fs.mkdir(devDir, { recursive: true }));
        yield* Effect.promise(() => fs.mkdir(configDir, { recursive: true }));

        const projectConfigWithComments = `{
  // Source of truth remote config
  "configUrl": "https://example.com/remote-config.json",
  "defaultOrg": "acme",
}`;
        const localConfigWithComments = `{
  // Outdated local URL that should be replaced
  "configUrl": "https://example.com/old-config.json",
  "defaultOrg": "acme",
}`;

        yield* Effect.promise(() => fs.writeFile(path.join(devDir, "config.json"), projectConfigWithComments));
        yield* Effect.promise(() => fs.writeFile(configPath, localConfigWithComments));

        const hostPaths = makeHostPathsMock({
          homeDir: tempDir,
          devDir,
          configDir,
          configPath,
          dataDir: path.join(tempDir, ".local", "share", "dev"),
          dbPath: path.join(tempDir, ".local", "share", "dev", "dev.db"),
          cacheDir: path.join(tempDir, ".cache", "dev"),
        });

        const fileSystem = makeFileSystemLive();
        const fileSystemLayer = Layer.succeed(FileSystemTag, fileSystem);
        const configLoader = makeConfigLoaderLive(fileSystem, unusedNetwork, configPath);

        yield* ensureCorrectConfigUrl(hostPaths, configLoader).pipe(Effect.provide(fileSystemLayer));

        const updatedLocalConfigContent = yield* Effect.promise(() => fs.readFile(configPath, "utf8"));
        const updatedLocalConfig = JSON.parse(updatedLocalConfigContent) as { configUrl: string };

        expect(updatedLocalConfig.configUrl).toBe("https://example.com/remote-config.json");

        yield* Effect.promise(() => fs.rm(tempDir, { recursive: true, force: true }));
      }),
    );

    it.effect("fails when project config is malformed", () =>
      Effect.gen(function* () {
        const tempDir = path.join(os.tmpdir(), `upgrade-command-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        yield* Effect.promise(() => fs.mkdir(tempDir, { recursive: true }));

        const devDir = path.join(tempDir, ".dev");
        const configDir = path.join(tempDir, ".config", "dev");
        const configPath = path.join(configDir, "config.json");

        yield* Effect.promise(() => fs.mkdir(devDir, { recursive: true }));
        yield* Effect.promise(() => fs.mkdir(configDir, { recursive: true }));

        yield* Effect.promise(() =>
          fs.writeFile(
            path.join(devDir, "config.json"),
            JSON.stringify({
              configUrl: 123,
              defaultOrg: "acme",
            }),
          ),
        );
        yield* Effect.promise(() =>
          fs.writeFile(
            configPath,
            JSON.stringify({
              configUrl: "https://example.com/old-config.json",
              defaultOrg: "acme",
            }),
          ),
        );

        const hostPaths = makeHostPathsMock({
          homeDir: tempDir,
          devDir,
          configDir,
          configPath,
          dataDir: path.join(tempDir, ".local", "share", "dev"),
          dbPath: path.join(tempDir, ".local", "share", "dev", "dev.db"),
          cacheDir: path.join(tempDir, ".cache", "dev"),
        });

        const fileSystem = makeFileSystemLive();
        const fileSystemLayer = Layer.succeed(FileSystemTag, fileSystem);
        const configLoader = makeConfigLoaderLive(fileSystem, unusedNetwork, configPath);

        const result = yield* Effect.either(ensureCorrectConfigUrl(hostPaths, configLoader).pipe(Effect.provide(fileSystemLayer)));

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("ConfigError");
          if (result.left._tag === "ConfigError") {
            expect(String(result.left.reason)).toContain("Invalid project config.json");
          }
        }

        yield* Effect.promise(() => fs.rm(tempDir, { recursive: true, force: true }));
      }),
    );
  });

  it.effect("checkTool preserves typed tool-manager failures", () =>
    Effect.gen(function* () {
      const toolManager: ToolManager = {
        getCurrentVersion: () => Effect.succeed(null),
        checkVersion: () => Effect.fail(shellExecutionError("bun", ["--version"], "spawn failed")),
        performUpgrade: () => Effect.succeed(true),
        ensureVersionOrUpgrade: () => Effect.void,
      };

      const error = yield* Effect.flip(checkTool("Bun", toolManager));

      expect(error._tag).toBe("ShellExecutionError");
      if (error._tag === "ShellExecutionError") {
        expect(error.reason).toContain("Bun version check failed");
      }
    }),
  );

  it.effect("selfUpdateCli fails when bun install exits non-zero", () =>
    Effect.gen(function* () {
      const tempDir = path.join(os.tmpdir(), `upgrade-self-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const hostPaths = makeHostPathsMock({
        homeDir: tempDir,
        devDir: tempDir,
        configDir: path.join(tempDir, ".config", "dev"),
        dataDir: path.join(tempDir, ".local", "share", "dev"),
        cacheDir: path.join(tempDir, ".cache", "dev"),
      });
      const git = new GitMock({ gitRepositories: [tempDir] });
      const shell = new ShellMock();
      shell.setExecResponse("bun", ["install"], {
        exitCode: 1,
        stdout: "",
        stderr: "install failed",
      });

      const error = yield* Effect.flip(
        selfUpdateCli(hostPaths).pipe(Effect.provideService(GitTag, git), Effect.provideService(ShellTag, shell)),
      );

      expect(error._tag).toBe("ExternalToolError");
      if (error._tag === "ExternalToolError") {
        expect(error.tool).toBe("bun");
        expect(error.exitCode).toBe(1);
      }
    }),
  );

  it.effect("selfUpdateCli skips git pull when local unstaged changes block rebase and still runs bun install", () =>
    Effect.gen(function* () {
      const tempDir = path.join(os.tmpdir(), `upgrade-self-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const hostPaths = makeHostPathsMock({
        homeDir: tempDir,
        devDir: tempDir,
        configDir: path.join(tempDir, ".config", "dev"),
        dataDir: path.join(tempDir, ".local", "share", "dev"),
        cacheDir: path.join(tempDir, ".cache", "dev"),
      });
      const git = new GitMock({
        gitRepositories: [tempDir],
        overrides: {
          pullLatestChanges: () =>
            gitError("Failed to pull: error: cannot pull with rebase: You have unstaged changes.\nerror: Please commit or stash them."),
        },
      });
      const shell = new ShellMock();

      yield* selfUpdateCli(hostPaths).pipe(Effect.provideService(GitTag, git), Effect.provideService(ShellTag, shell));

      expect(git.pullCalls).toEqual([tempDir]);
      expect(shell.execCalls).toContainEqual({
        command: "bun",
        args: ["install"],
        options: { cwd: tempDir },
      });
    }),
  );

  it.effect("selfUpdateCli still fails on other git pull errors", () =>
    Effect.gen(function* () {
      const tempDir = path.join(os.tmpdir(), `upgrade-self-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const hostPaths = makeHostPathsMock({
        homeDir: tempDir,
        devDir: tempDir,
        configDir: path.join(tempDir, ".config", "dev"),
        dataDir: path.join(tempDir, ".local", "share", "dev"),
        cacheDir: path.join(tempDir, ".cache", "dev"),
      });
      const git = new GitMock({
        gitRepositories: [tempDir],
        overrides: {
          pullLatestChanges: () => gitError("Failed to pull: fatal: not a git repository"),
        },
      });
      const shell = new ShellMock();

      const error = yield* Effect.flip(
        selfUpdateCli(hostPaths).pipe(Effect.provideService(GitTag, git), Effect.provideService(ShellTag, shell)),
      );

      expect(error._tag).toBe("GitError");
      expect(shell.execCalls).toEqual([]);
    }),
  );

  it.effect("upgradeEssentialTools fails fast on the first essential tool error", () =>
    Effect.gen(function* () {
      const secondToolChecks = yield* Ref.make(0);
      const failingTool: ToolManager = {
        getCurrentVersion: () => Effect.succeed("0.1.0"),
        checkVersion: () => Effect.succeed({ isValid: false, currentVersion: "0.1.0" }),
        performUpgrade: () => Effect.succeed(false),
        ensureVersionOrUpgrade: () => Effect.fail(shellExecutionError("mise", ["install", "git@latest"], "upgrade failed")),
      };
      const untouchedTool: ToolManager = {
        getCurrentVersion: () => Effect.succeed("1.0.0"),
        checkVersion: () => Ref.update(secondToolChecks, (count) => count + 1).pipe(Effect.as({ isValid: true, currentVersion: "1.0.0" })),
        performUpgrade: () => Effect.succeed(true),
        ensureVersionOrUpgrade: () => Effect.void,
      };
      const toolManagement: ToolManagement = {
        tools: {},
        listTools: () => [],
        listEssentialTools: () => [createManagedTool("git", "Git", failingTool), createManagedTool("bun", "Bun", untouchedTool)],
      };

      const error = yield* Effect.flip(upgradeEssentialTools().pipe(Effect.provideService(ToolManagementTag, toolManagement)));

      expect(error._tag).toBe("ShellExecutionError");
      expect(yield* Ref.get(secondToolChecks)).toBe(0);
    }),
  );

  it.effect("upgradeEssentialTools runs essential tools sequentially", () =>
    Effect.gen(function* () {
      const firstStarted = yield* Deferred.make<void>();
      const releaseFirst = yield* Deferred.make<void>();
      const calls = yield* Ref.make<string[]>([]);

      const firstTool: ToolManager = {
        getCurrentVersion: () => Effect.succeed("1.0.0"),
        checkVersion: () =>
          Effect.gen(function* () {
            yield* Ref.update(calls, (entries) => [...entries, "git"]);
            yield* Deferred.succeed(firstStarted, undefined);
            yield* Deferred.await(releaseFirst);
            return { isValid: true, currentVersion: "1.0.0" as const };
          }),
        performUpgrade: () => Effect.succeed(true),
        ensureVersionOrUpgrade: () => Effect.void,
      };
      const secondTool: ToolManager = {
        getCurrentVersion: () => Effect.succeed("1.0.0"),
        checkVersion: () => Ref.update(calls, (entries) => [...entries, "bun"]).pipe(Effect.as({ isValid: true, currentVersion: "1.0.0" })),
        performUpgrade: () => Effect.succeed(true),
        ensureVersionOrUpgrade: () => Effect.void,
      };
      const toolManagement: ToolManagement = {
        tools: {},
        listTools: () => [],
        listEssentialTools: () => [createManagedTool("git", "Git", firstTool), createManagedTool("bun", "Bun", secondTool)],
      };

      const fiber = yield* Effect.fork(upgradeEssentialTools().pipe(Effect.provideService(ToolManagementTag, toolManagement)));

      yield* Deferred.await(firstStarted);
      expect(yield* Ref.get(calls)).toEqual(["git"]);

      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Fiber.join(fiber);

      expect(yield* Ref.get(calls)).toEqual(["git", "bun"]);
    }),
  );
});
