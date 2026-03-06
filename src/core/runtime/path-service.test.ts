import path from "path";

import { describe, expect, it } from "vitest";

import { createHostPaths, createWorkspacePaths, resolveUserPath, type HostPathsRuntime } from "~/core/runtime/path-service";

const runtime: HostPathsRuntime = {
  homeDir: "/tmp/home",
  xdgConfigHome: "/tmp/home/.config",
  xdgDataHome: "/tmp/home/.local/share",
  xdgCacheHome: "/tmp/home/.cache",
  cwd: "/tmp/workspace",
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

  it("createHostPaths derives host-local dev and XDG paths", () => {
    const hostPaths = createHostPaths(runtime);

    expect(hostPaths.devDir).toBe(path.join(runtime.homeDir, ".dev"));
    expect(hostPaths.configDir).toBe(path.join(runtime.xdgConfigHome, "dev"));
    expect(hostPaths.configPath).toBe(path.join(runtime.xdgConfigHome, "dev", "config.json"));
    expect(hostPaths.dataDir).toBe(path.join(runtime.xdgDataHome, "dev"));
    expect(hostPaths.dbPath).toBe(path.join(runtime.xdgDataHome, "dev", "dev.db"));
    expect(hostPaths.cacheDir).toBe(path.join(runtime.xdgCacheHome, "dev"));
  });

  it("createHostPaths lets configPath override the default config location", () => {
    const hostPaths = createHostPaths(runtime, { configPath: "~/custom/dev.json" });

    expect(hostPaths.configPath).toBe(path.join(runtime.homeDir, "custom/dev.json"));
    expect(hostPaths.configDir).toBe(path.join(runtime.homeDir, "custom"));
  });

  it("createWorkspacePaths uses the default search root when none is provided", () => {
    const hostPaths = createHostPaths(runtime);
    const workspacePaths = createWorkspacePaths(hostPaths);

    expect(workspacePaths.baseSearchPath).toBe(path.join(runtime.homeDir, "src"));
  });

  it("createWorkspacePaths resolves explicit search roots through host path resolution", () => {
    const hostPaths = createHostPaths(runtime);

    expect(createWorkspacePaths(hostPaths, "~/projects").baseSearchPath).toBe(path.join(runtime.homeDir, "projects"));
    expect(createWorkspacePaths(hostPaths, "projects").baseSearchPath).toBe(path.join(runtime.cwd, "projects"));
  });
});
