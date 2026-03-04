import path from "path";

import { describe, expect, it } from "vitest";

import { configSchema } from "./config-schema";
import { createPathService, DEFAULT_HOME_DIR, resolveUserPath } from "./path-service";

describe("path-service", () => {
  it("resolveUserPath expands tilde-prefixed paths", () => {
    expect(resolveUserPath("~/src", "/tmp/home")).toBe("/tmp/home/src");
    expect(resolveUserPath("~", "/tmp/home")).toBe("/tmp/home");
  });

  it("resolveUserPath resolves relative and absolute paths", () => {
    expect(resolveUserPath("relative/path", "/tmp/home")).toBe(path.resolve("relative/path"));
    expect(resolveUserPath("/tmp/absolute", "/tmp/home")).toBe("/tmp/absolute");
  });

  it("createPathService uses default base search path when none is provided", () => {
    const pathService = createPathService();

    expect(pathService.baseSearchPath).toBe(path.join(DEFAULT_HOME_DIR, "src"));
  });

  it("createPathService resolves provided base search path", () => {
    const pathService = createPathService("~/work");

    expect(pathService.baseSearchPath).toBe(path.join(DEFAULT_HOME_DIR, "work"));
  });

  it("getBasePath resolves baseSearchPath from config", () => {
    const pathService = createPathService();
    const config = configSchema.parse({
      baseSearchPath: "~/projects",
    });

    expect(pathService.getBasePath(config)).toBe(path.join(DEFAULT_HOME_DIR, "projects"));
  });
});
