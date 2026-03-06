import fs from "fs/promises";
import os from "os";
import path from "path";

import { it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Ref } from "effect";
import { describe, expect, it as vitestIt } from "vitest";

import { FileSystemLive } from "~/capabilities/system/file-system-live";
import { FileSystem } from "~/capabilities/system/file-system-port";
import { GitMock } from "~/capabilities/system/git-mock";
import { Git } from "~/capabilities/system/git-port";
import { Network, type NetworkService } from "~/capabilities/system/network-port";
import { ShellMock } from "~/capabilities/system/shell-mock";
import { Shell } from "~/capabilities/system/shell-port";
import type { ManagedTool, ToolManagementService, ToolManager } from "~/capabilities/tools/tool-management-port";
import { ToolManagement } from "~/capabilities/tools/tool-management-port";
import { ConfigLoaderLiveLayer } from "~/core/config/config-loader-live";
import { ConfigLoader } from "~/core/config/config-loader-port";
import { GitError, ShellExecutionError } from "~/core/errors";
import { StatePaths, type InstallPathsService } from "~/core/runtime/path-service";
import { makeInstallPathsMock, makeStatePathsMock } from "~/core/runtime/path-service-mock";
import { checkTool, ensureCorrectConfigUrl, selfUpdateCli, upgradeEssentialTools } from "~/features/upgrade/upgrade-command";

const unusedNetwork: NetworkService = {
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

const makeTestStatePaths = (tempDir: string) =>
  makeStatePathsMock({
    stateDir: path.join(tempDir, "state"),
    configPath: path.join(tempDir, "state", "config.json"),
    dbPath: path.join(tempDir, "state", "dev.db"),
    cacheDir: path.join(tempDir, "state", "cache"),
    dockerDir: path.join(tempDir, "state", "docker"),
    runDir: path.join(tempDir, "state", "run"),
  });

const writeProjectConfig = (installPaths: InstallPathsService, projectConfigContent: string) =>
  fs
    .mkdir(installPaths.installDir, { recursive: true })
    .then(() => fs.writeFile(path.join(installPaths.installDir, "config.json"), projectConfigContent));

const makeConfigLoader = (configPath: string, network: NetworkService) =>
  Effect.gen(function* () {
    return yield* ConfigLoader;
  }).pipe(
    Effect.provide(
      Layer.provide(
        ConfigLoaderLiveLayer,
        Layer.mergeAll(
          Layer.succeed(FileSystem, FileSystemLive),
          Layer.succeed(Network, network),
          Layer.succeed(StatePaths, makeStatePathsMock({ configPath })),
        ),
      ),
    ),
  );

describe("upgrade-command", () => {
  describe("ensureCorrectConfigUrl", () => {
    it.effect("parses JSONC in project and local config files", () =>
      Effect.gen(function* () {
        const tempDir = path.join(os.tmpdir(), `upgrade-command-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const statePaths = makeTestStatePaths(tempDir);
        const installPaths = makeInstallPathsMock({ installDir: path.join(tempDir, ".dev") });
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

        yield* Effect.promise(() => fs.mkdir(path.dirname(statePaths.configPath), { recursive: true }));
        yield* Effect.promise(() => fs.writeFile(statePaths.configPath, localConfigWithComments));
        yield* Effect.promise(() => writeProjectConfig(installPaths, projectConfigWithComments));

        const fileSystemLayer = Layer.succeed(FileSystem, FileSystemLive);
        const configLoader = yield* makeConfigLoader(statePaths.configPath, unusedNetwork);

        yield* ensureCorrectConfigUrl(statePaths, installPaths, configLoader).pipe(Effect.provide(fileSystemLayer));

        const updatedLocalConfigContent = yield* Effect.promise(() => fs.readFile(statePaths.configPath, "utf8"));
        const updatedLocalConfig = JSON.parse(updatedLocalConfigContent) as { configUrl: string };

        expect(updatedLocalConfig.configUrl).toBe("https://example.com/remote-config.json");

        yield* Effect.promise(() => fs.rm(tempDir, { recursive: true, force: true }));
      }),
    );

    it.effect("fails when project config is malformed", () =>
      Effect.gen(function* () {
        const tempDir = path.join(os.tmpdir(), `upgrade-command-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const statePaths = makeTestStatePaths(tempDir);
        const installPaths = makeInstallPathsMock({ installDir: path.join(tempDir, ".dev") });

        yield* Effect.promise(() => fs.mkdir(path.dirname(statePaths.configPath), { recursive: true }));
        yield* Effect.promise(() =>
          fs.writeFile(
            statePaths.configPath,
            JSON.stringify({
              configUrl: "https://example.com/old-config.json",
              defaultOrg: "acme",
            }),
          ),
        );
        yield* Effect.promise(() =>
          writeProjectConfig(
            installPaths,
            JSON.stringify({
              configUrl: 123,
              defaultOrg: "acme",
            }),
          ),
        );

        const fileSystemLayer = Layer.succeed(FileSystem, FileSystemLive);
        const configLoader = yield* makeConfigLoader(statePaths.configPath, unusedNetwork);
        const result = yield* Effect.either(
          ensureCorrectConfigUrl(statePaths, installPaths, configLoader).pipe(Effect.provide(fileSystemLayer)),
        );

        expect(result._tag).toBe("Left");
        if (result._tag === "Left") {
          expect(result.left._tag).toBe("ConfigError");
          if (result.left._tag === "ConfigError") {
            expect(result.left.message).toContain("Invalid project config.json");
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
        checkVersion: () => Effect.fail(new ShellExecutionError({ command: "bun", args: ["--version"], message: "spawn failed" })),
        performUpgrade: () => Effect.succeed(true),
        ensureVersionOrUpgrade: () => Effect.void,
      };

      const error = yield* Effect.flip(checkTool("Bun", toolManager));

      expect(error._tag).toBe("ShellExecutionError");
      if (error._tag === "ShellExecutionError") {
        expect(error.message).toContain("Bun version check failed");
      }
    }),
  );

  it.effect("selfUpdateCli skips repo updates for externally managed binary installs", () =>
    Effect.gen(function* () {
      const installPaths = makeInstallPathsMock({
        installMode: "binary",
        installDir: "/tmp/dist",
        upgradeCapable: false,
      });
      const git = new GitMock({ gitRepositories: ["/tmp/dist"] });
      const shell = new ShellMock();

      yield* selfUpdateCli(installPaths).pipe(Effect.provideService(Git, git), Effect.provideService(Shell, shell));

      expect(git.isGitRepositoryCalls).toEqual([]);
      expect(git.pullCalls).toEqual([]);
      expect(shell.execCalls).toEqual([]);
    }),
  );

  it.effect("selfUpdateCli fails when bun install exits non-zero", () =>
    Effect.gen(function* () {
      const tempDir = path.join(os.tmpdir(), `upgrade-self-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      yield* Effect.promise(() => fs.mkdir(tempDir, { recursive: true }));
      const installPaths = makeInstallPathsMock({ installDir: tempDir });
      const git = new GitMock({ gitRepositories: [tempDir] });
      const shell = new ShellMock();
      shell.setExecResponse("bun", ["install"], {
        exitCode: 1,
        stdout: "",
        stderr: "install failed",
      });

      const error = yield* Effect.flip(
        selfUpdateCli(installPaths).pipe(Effect.provideService(Git, git), Effect.provideService(Shell, shell)),
      );

      expect(error._tag).toBe("ExternalToolError");
      if (error._tag === "ExternalToolError") {
        expect(error.tool).toBe("bun");
        expect(error.toolExitCode).toBe(1);
      }
    }),
  );

  it.effect("selfUpdateCli skips git pull when local unstaged changes block rebase and still runs bun install", () =>
    Effect.gen(function* () {
      const tempDir = path.join(os.tmpdir(), `upgrade-self-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      yield* Effect.promise(() => fs.mkdir(tempDir, { recursive: true }));
      const installPaths = makeInstallPathsMock({ installDir: tempDir });
      const git = new GitMock({
        gitRepositories: [tempDir],
        overrides: {
          pullLatestChanges: () =>
            new GitError({
              message: "Failed to pull: error: cannot pull with rebase: You have unstaged changes.\nerror: Please commit or stash them.",
            }),
        },
      });
      const shell = new ShellMock();

      yield* selfUpdateCli(installPaths).pipe(Effect.provideService(Git, git), Effect.provideService(Shell, shell));

      expect(git.pullCalls).toEqual([tempDir]);
      expect(shell.execCalls).toContainEqual({
        command: "bun",
        args: ["install"],
        options: { cwd: tempDir },
      });
    }),
  );

  it.effect("selfUpdateCli continues on other git pull GitErrors and still runs bun install", () =>
    Effect.gen(function* () {
      const tempDir = path.join(os.tmpdir(), `upgrade-self-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      yield* Effect.promise(() => fs.mkdir(tempDir, { recursive: true }));
      const installPaths = makeInstallPathsMock({ installDir: tempDir });
      const git = new GitMock({
        gitRepositories: [tempDir],
        overrides: {
          pullLatestChanges: () => new GitError({ message: "Failed to pull: fatal: not a git repository" }),
        },
      });
      const shell = new ShellMock();

      yield* selfUpdateCli(installPaths).pipe(Effect.provideService(Git, git), Effect.provideService(Shell, shell));

      expect(git.pullCalls).toEqual([tempDir]);
      expect(shell.execCalls).toContainEqual({
        command: "bun",
        args: ["install"],
        options: { cwd: tempDir },
      });
    }),
  );

  it.effect("selfUpdateCli still fails when git command execution itself fails", () =>
    Effect.gen(function* () {
      const tempDir = path.join(os.tmpdir(), `upgrade-self-update-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      yield* Effect.promise(() => fs.mkdir(tempDir, { recursive: true }));
      const installPaths = makeInstallPathsMock({ installDir: tempDir });
      const git = new GitMock({
        gitRepositories: [tempDir],
        overrides: {
          pullLatestChanges: () => new ShellExecutionError({ command: "git", args: ["pull"], message: "spawn failed", cwd: tempDir }),
        },
      });
      const shell = new ShellMock();

      const error = yield* Effect.flip(
        selfUpdateCli(installPaths).pipe(Effect.provideService(Git, git), Effect.provideService(Shell, shell)),
      );

      expect(error._tag).toBe("ShellExecutionError");
      expect(shell.execCalls).toEqual([]);
    }),
  );

  vitestIt(
    "selfUpdateCli waits for an existing install lock before mutating the shared repo",
    async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `upgrade-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}-`));
      const installPaths = makeInstallPathsMock({ installDir: tempDir });
      const installLockPath = path.join(tempDir, ".dev-upgrade.lock");
      const git = new GitMock({ gitRepositories: [tempDir] });
      const shell = new ShellMock();
      const startedAt = Date.now();

      await fs.mkdir(installLockPath, { recursive: true });
      const lockReleaseTimer = setTimeout(() => {
        void fs.rm(installLockPath, { recursive: true, force: true });
      }, 50);

      await Effect.runPromise(selfUpdateCli(installPaths).pipe(Effect.provideService(Git, git), Effect.provideService(Shell, shell)));

      clearTimeout(lockReleaseTimer);

      expect(Date.now() - startedAt).toBeGreaterThanOrEqual(40);
      expect(git.pullCalls).toEqual([tempDir]);
      expect(shell.execCalls).toContainEqual({
        command: "bun",
        args: ["install"],
        options: { cwd: tempDir },
      });
      await fs.rm(tempDir, { recursive: true, force: true });
    },
    10_000,
  );

  it.effect("upgradeEssentialTools fails fast on the first essential tool error", () =>
    Effect.gen(function* () {
      const secondToolChecks = yield* Ref.make(0);
      const failingTool: ToolManager = {
        getCurrentVersion: () => Effect.succeed("0.1.0"),
        checkVersion: () => Effect.succeed({ isValid: false, currentVersion: "0.1.0" }),
        performUpgrade: () => Effect.succeed(false),
        ensureVersionOrUpgrade: () =>
          Effect.fail(new ShellExecutionError({ command: "mise", args: ["install", "git@latest"], message: "upgrade failed" })),
      };
      const untouchedTool: ToolManager = {
        getCurrentVersion: () => Effect.succeed("1.0.0"),
        checkVersion: () => Ref.update(secondToolChecks, (count) => count + 1).pipe(Effect.as({ isValid: true, currentVersion: "1.0.0" })),
        performUpgrade: () => Effect.succeed(true),
        ensureVersionOrUpgrade: () => Effect.void,
      };
      const toolManagement: ToolManagementService = {
        tools: {},
        listTools: () => [],
        listEssentialTools: () => [createManagedTool("git", "Git", failingTool), createManagedTool("bun", "Bun", untouchedTool)],
      };

      const error = yield* Effect.flip(upgradeEssentialTools().pipe(Effect.provideService(ToolManagement, toolManagement)));

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
      const toolManagement: ToolManagementService = {
        tools: {},
        listTools: () => [],
        listEssentialTools: () => [createManagedTool("git", "Git", firstTool), createManagedTool("bun", "Bun", secondTool)],
      };

      const fiber = yield* Effect.fork(upgradeEssentialTools().pipe(Effect.provideService(ToolManagement, toolManagement)));

      yield* Deferred.await(firstStarted);
      expect(yield* Ref.get(calls)).toEqual(["git"]);

      yield* Deferred.succeed(releaseFirst, undefined);
      yield* Fiber.join(fiber);

      expect(yield* Ref.get(calls)).toEqual(["git", "bun"]);
    }),
  );
});
