import path from "path";

import { describe, expect, it } from "vitest";

import { configSchema } from "./config-schema";
import { createPathService, resolveUserPath, type PathServiceRuntime } from "./path-service";

const runtime: PathServiceRuntime = {
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

  it("createPathService uses default base search path when none is provided", () => {
    const pathService = createPathService(runtime);

    expect(pathService.baseSearchPath).toBe(path.join(runtime.homeDir, "src"));
  });

  it("createPathService resolves provided base search path", () => {
    const pathService = createPathService(runtime, "~/work");

    expect(pathService.baseSearchPath).toBe(path.join(runtime.homeDir, "work"));
  });

  it("getBasePath resolves baseSearchPath from config", () => {
    const pathService = createPathService(runtime);
    const config = configSchema.parse({
      baseSearchPath: "~/projects",
    });

    expect(pathService.getBasePath(config)).toBe(path.join(runtime.homeDir, "projects"));
  });

  it("getBasePath resolves relative baseSearchPath from the explicit runtime cwd", () => {
    const pathService = createPathService(runtime);
    const config = configSchema.parse({
      baseSearchPath: "projects",
    });

    expect(pathService.getBasePath(config)).toBe(path.join(runtime.cwd, "projects"));
  });
});
