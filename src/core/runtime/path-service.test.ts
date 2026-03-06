import path from "path";

import { describe, expect, it } from "vitest";

import {
  createEnvironmentPaths,
  createInstallPaths,
  createStatePaths,
  createWorkspacePaths,
  resolveUserPath,
  type PathRuntime,
} from "~/core/runtime/path-service";

const runtime: PathRuntime = {
  homeDir: "/tmp/home",
  xdgConfigHome: "/tmp/home/.config",
  cwd: "/tmp/workspace",
  argv: ["bun", "/tmp/home/.dev/src/index.ts", "status"],
  execPath: "/opt/homebrew/bin/bun",
};

describe("path-service", () => {
  it("resolveUserPath expands tilde-prefixed paths", () => {
    expect(resolveUserPath("~/src", runtime)).toBe("/tmp/home/src");
    expect(resolveUserPath("~", runtime)).toBe("/tmp/home");
  });

  it("resolveUserPath resolves relative and absolute paths", () => {
    expect(resolveUserPath("relative/path", runtime)).toBe(path.resolve("/tmp/workspace", "relative/path"));
    expect(resolveUserPath("/tmp/absolute", runtime)).toBe("/tmp/absolute");
  });

  it("createStatePaths derives app-owned state paths under ~/.dev/state by default", () => {
    const statePaths = createStatePaths(runtime);

    expect(statePaths.stateDir).toBe(path.join(runtime.homeDir, ".dev", "state"));
    expect(statePaths.configPath).toBe(path.join(runtime.homeDir, ".dev", "state", "config.json"));
    expect(statePaths.dbPath).toBe(path.join(runtime.homeDir, ".dev", "state", "dev.db"));
    expect(statePaths.cacheDir).toBe(path.join(runtime.homeDir, ".dev", "state", "cache"));
    expect(statePaths.dockerDir).toBe(path.join(runtime.homeDir, ".dev", "state", "docker"));
    expect(statePaths.runDir).toBe(path.join(runtime.homeDir, ".dev", "state", "run"));
  });

  it("createStatePaths lets configPath override the default config location", () => {
    const statePaths = createStatePaths(runtime, { configPath: "~/custom/dev.json" });

    expect(statePaths.configPath).toBe(path.join(runtime.homeDir, "custom/dev.json"));
    expect(statePaths.stateDir).toBe(path.join(runtime.homeDir, ".dev", "state"));
  });

  it("createInstallPaths derives repo-mode install metadata from the script path", () => {
    const installPaths = createInstallPaths(runtime);

    expect(installPaths.installMode).toBe("repo");
    expect(installPaths.installDir).toBe(path.join(runtime.homeDir, ".dev"));
    expect(installPaths.upgradeCapable).toBe(true);
  });

  it("createInstallPaths derives binary-mode install metadata from the executable path", () => {
    const installPaths = createInstallPaths({
      ...runtime,
      argv: ["/tmp/dist/dev", "/tmp/dist/dev", "status"],
      execPath: "/tmp/dist/dev",
    });

    expect(installPaths.installMode).toBe("binary");
    expect(installPaths.installDir).toBe("/tmp/dist");
    expect(installPaths.upgradeCapable).toBe(false);
  });

  it("createWorkspacePaths uses the default search root when none is provided", () => {
    const environmentPaths = createEnvironmentPaths(runtime);
    const workspacePaths = createWorkspacePaths(environmentPaths);

    expect(workspacePaths.baseSearchPath).toBe(path.join(runtime.homeDir, "src"));
  });

  it("createWorkspacePaths resolves explicit search roots through environment path resolution", () => {
    const environmentPaths = createEnvironmentPaths(runtime);

    expect(createWorkspacePaths(environmentPaths, "~/projects").baseSearchPath).toBe(path.join(runtime.homeDir, "projects"));
    expect(createWorkspacePaths(environmentPaths, "projects").baseSearchPath).toBe(path.join(runtime.cwd, "projects"));
  });
});
