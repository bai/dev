import { it } from "@effect/vitest";
import { Effect, Exit, Layer } from "effect";
import { beforeEach, describe, expect } from "vitest";

import { FileSystemTag } from "~/capabilities/system/file-system-port";
import type { FileSystem } from "~/capabilities/system/file-system-port";
import { ShellMock } from "~/capabilities/system/shell-mock";
import { ShellTag } from "~/capabilities/system/shell-port";
import { MiseLiveLayer } from "~/capabilities/tools/mise-live";
import { MiseTag, type Mise } from "~/capabilities/tools/mise-port";
import { ConfigLoaderTag } from "~/core/config/config-loader-port";
import type { ConfigLoader } from "~/core/config/config-loader-port";
import { configSchema } from "~/core/config/config-schema";
import { configError } from "~/core/errors";
import { HostPathsTag, type HostPaths } from "~/core/runtime/path-service";
import { makeHostPathsMock } from "~/core/runtime/path-service-mock";

const mockShell = new ShellMock();

const seedMockShell = (): void => {
  mockShell.execCalls.length = 0;
  mockShell.execInteractiveCalls.length = 0;
  mockShell.setExecResponse("mise", ["--version"], {
    exitCode: 0,
    stdout: "2024.1.0 macos-arm64 (2024-01-01)",
    stderr: "",
  });
  mockShell.setExecResponse("mise", ["current"], {
    exitCode: 0,
    stdout: "node 20.10.0\nbun 1.2.17\n",
    stderr: "",
  });
  mockShell.setExecResponse("mise", ["tasks", "--list"], {
    exitCode: 0,
    stdout: "lint\ntest\nbuild\nsecrets\n",
    stderr: "",
  });
};

const getLastExecCall = () => mockShell.execCalls.at(-1);
const getLastInteractiveCall = () => mockShell.execInteractiveCalls.at(-1);

const mockFileSystem = {
  exists: (_path) => Effect.succeed(true),
  mkdir: (_path, _recursive) => Effect.void,
  writeFile: (_path, _content) => Effect.void,
  readFile: (_path) => Effect.succeed("test content"),
  getCwd: () => Effect.succeed("/test/directory"),
  findDirectoriesGlob: (_basePath, _pattern) => Effect.succeed([]),
} satisfies FileSystem;

const mockConfigLoader: ConfigLoader = {
  parse: (content, source = "config") =>
    Effect.try({
      try: () => configSchema.parse(Bun.JSONC.parse(content)),
      catch: (error) => configError(`Invalid ${source}: ${error}`),
    }),
  load: () =>
    Effect.succeed(
      configSchema.parse({
        configUrl: "https://example.com/config.json",
        defaultOrg: "test-org",
        telemetry: { mode: "disabled" },
        miseGlobalConfig: {
          settings: {
            experimental: true,
          },
        },
      }),
    ),
  save: () => Effect.void,
  refresh: () =>
    Effect.succeed(
      configSchema.parse({
        configUrl: "https://example.com/config.json",
        defaultOrg: "test-org",
        telemetry: { mode: "disabled" },
        miseGlobalConfig: {
          settings: {
            experimental: true,
          },
        },
      }),
    ),
};

const mockHostPaths = makeHostPathsMock({
  homeDir: "/home/user",
  xdgConfigHome: "/xdg/config",
  xdgDataHome: "/xdg/data",
  xdgCacheHome: "/xdg/cache",
});

describe("mise-live", () => {
  const makeMise = ({
    shell = mockShell,
    fileSystem = mockFileSystem,
    configLoader = mockConfigLoader,
    hostPaths = mockHostPaths,
  }: {
    readonly shell?: ShellMock;
    readonly fileSystem?: FileSystem;
    readonly configLoader?: ConfigLoader;
    readonly hostPaths?: HostPaths;
  } = {}): Effect.Effect<Mise> =>
    Effect.gen(function* () {
      return yield* MiseTag;
    }).pipe(
      Effect.provide(
        Layer.provide(
          MiseLiveLayer,
          Layer.mergeAll(
            Layer.succeed(ShellTag, shell),
            Layer.succeed(FileSystemTag, fileSystem),
            Layer.succeed(ConfigLoaderTag, configLoader),
            Layer.succeed(HostPathsTag, hostPaths),
          ),
        ),
      ),
    );

  beforeEach(() => {
    seedMockShell();
  });

  it.effect("runs a task without arguments", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      yield* mise.runTask("lint");

      expect(getLastInteractiveCall()).toEqual({
        command: "mise",
        args: ["run", "lint"],
        options: { cwd: undefined },
      });
    }),
  );

  it.effect("runs a task with single argument", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      yield* mise.runTask("test", ["--watch"]);

      expect(getLastInteractiveCall()).toEqual({
        command: "mise",
        args: ["run", "test", "--watch"],
        options: { cwd: undefined },
      });
    }),
  );

  it.effect("runs a task with multiple arguments", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      yield* mise.runTask("secrets", ["decrypt", "--env", "prod"], "/custom/path");

      expect(getLastInteractiveCall()).toEqual({
        command: "mise",
        args: ["run", "secrets", "decrypt", "--env", "prod"],
        options: { cwd: "/custom/path" },
      });
    }),
  );

  it.effect("runs a task with empty args array", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      yield* mise.runTask("build", []);

      expect(getLastInteractiveCall()).toEqual({
        command: "mise",
        args: ["run", "build"],
        options: { cwd: undefined },
      });
    }),
  );

  it.effect("handles task execution failure", () =>
    Effect.gen(function* () {
      const failingShell = new ShellMock();
      failingShell.setExecInteractiveResponse("mise", ["run", "failing-task"], 1);

      const failingMise = yield* makeMise({ shell: failingShell });
      const result = yield* Effect.exit(failingMise.runTask("failing-task"));

      expect(Exit.isFailure(result)).toBe(true);
    }),
  );

  it.effect("checks installation and parses version correctly", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      const result = yield* mise.checkInstallation();

      expect(result).toEqual({
        version: "2024.1.0",
        runtimeVersions: {
          node: "20.10.0",
          bun: "1.2.17",
        },
      });
    }),
  );

  it.effect("gets tasks list correctly", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      const result = yield* mise.getTasks();

      expect(result).toEqual(["lint", "test", "build", "secrets"]);
    }),
  );

  it.effect("installs tools with correct arguments", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      yield* mise.installTools("/custom/path");

      expect(getLastExecCall()).toEqual({
        command: "mise",
        args: ["install"],
        options: { cwd: "/custom/path" },
      });
    }),
  );

  it.effect("installs mise using shell pipeline execution", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      yield* mise.install();

      expect(getLastExecCall()).toEqual({
        command: "sh",
        args: ["-c", "curl -sSfL https://mise.run | sh"],
        options: undefined,
      });
    }),
  );

  it.effect("handles missing cwd parameter correctly", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      yield* mise.runTask("test", ["--help"]);

      expect(getLastInteractiveCall()?.options?.cwd).toBeUndefined();
    }),
  );

  it.effect("preserves argument order when running tasks", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      const args = ["subcommand", "--flag1", "value1", "--flag2", "value2"];
      yield* mise.runTask("complex-task", args);

      expect(getLastInteractiveCall()?.args).toEqual(["run", "complex-task", "subcommand", "--flag1", "value1", "--flag2", "value2"]);
    }),
  );

  it.effect("handles undefined args parameter", () =>
    Effect.gen(function* () {
      const mise = yield* makeMise();
      yield* mise.runTask("simple-task", undefined);

      expect(getLastInteractiveCall()?.args).toEqual(["run", "simple-task"]);
    }),
  );

  it.effect("setupGlobalConfig writes config to the shared XDG config root", () =>
    Effect.gen(function* () {
      const writeFileCalls: Array<{ path: string; content: string }> = [];
      const existsCalls: string[] = [];
      const mkdirCalls: Array<{ path: string; recursive?: boolean }> = [];

      const trackingFileSystem: FileSystem = {
        ...mockFileSystem,
        exists: (p) => {
          existsCalls.push(p);
          return Effect.succeed(false);
        },
        mkdir: (p, recursive) => {
          mkdirCalls.push({ path: p, recursive });
          return Effect.void;
        },
        writeFile: (p, content) => {
          writeFileCalls.push({ path: p, content });
          return Effect.void;
        },
      };

      const trackingMise = yield* makeMise({ fileSystem: trackingFileSystem });
      yield* trackingMise.setupGlobalConfig();

      expect(existsCalls).toContain("/xdg/config/mise");
      expect(mkdirCalls).toEqual([{ path: "/xdg/config/mise", recursive: true }]);
      expect(writeFileCalls).toHaveLength(1);
      expect(writeFileCalls[0]?.path).toBe("/xdg/config/mise/config.toml");
      expect(writeFileCalls[0]?.content).toContain("[settings]");
    }),
  );

  it.effect("setupGlobalConfig skips mkdir when config directory exists", () =>
    Effect.gen(function* () {
      const mkdirCalls: Array<{ path: string }> = [];
      const writeFileCalls: Array<{ path: string; content: string }> = [];

      const trackingFileSystem: FileSystem = {
        ...mockFileSystem,
        exists: () => Effect.succeed(true),
        mkdir: (p) => {
          mkdirCalls.push({ path: p });
          return Effect.void;
        },
        writeFile: (p, content) => {
          writeFileCalls.push({ path: p, content });
          return Effect.void;
        },
      };

      const trackingMise = yield* makeMise({ fileSystem: trackingFileSystem });
      yield* trackingMise.setupGlobalConfig();

      expect(mkdirCalls).toHaveLength(0);
      expect(writeFileCalls[0]?.path).toBe("/xdg/config/mise/config.toml");
    }),
  );
});
