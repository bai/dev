import { describe, expect, it } from "vitest";

import { makeHostPathsMock, makeWorkspacePathsMock } from "~/core/runtime/path-service-mock";

describe("path-service-mock", () => {
  it("derives dev config, data, and cache paths from XDG roots", () => {
    const hostPaths = makeHostPathsMock({
      homeDir: "/home/user",
      xdgConfigHome: "/xdg/config",
      xdgDataHome: "/xdg/data",
      xdgCacheHome: "/xdg/cache",
    });

    expect(hostPaths.configDir).toBe("/xdg/config/dev");
    expect(hostPaths.configPath).toBe("/xdg/config/dev/config.json");
    expect(hostPaths.dataDir).toBe("/xdg/data/dev");
    expect(hostPaths.dbPath).toBe("/xdg/data/dev/dev.db");
    expect(hostPaths.cacheDir).toBe("/xdg/cache/dev");
    expect(hostPaths.devDir).toBe("/home/user/.dev");
  });

  it("lets explicit path overrides win over derived XDG paths", () => {
    const hostPaths = makeHostPathsMock({
      homeDir: "/home/user",
      xdgConfigHome: "/xdg/config",
      configDir: "/custom/config/dev",
      configPath: "/custom/config/dev/custom.json",
      dataDir: "/custom/data/dev",
      dbPath: "/custom/data/dev/custom.db",
      cacheDir: "/custom/cache/dev",
    });

    expect(hostPaths.configDir).toBe("/custom/config/dev");
    expect(hostPaths.configPath).toBe("/custom/config/dev/custom.json");
    expect(hostPaths.dataDir).toBe("/custom/data/dev");
    expect(hostPaths.dbPath).toBe("/custom/data/dev/custom.db");
    expect(hostPaths.cacheDir).toBe("/custom/cache/dev");
  });

  it("creates workspace paths independently from host paths", () => {
    const workspacePaths = makeWorkspacePathsMock("/workspace/src");

    expect(workspacePaths.baseSearchPath).toBe("/workspace/src");
  });
});
