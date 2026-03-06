import { describe, expect, it } from "vitest";

import { makePathServiceMock } from "./path-service-mock";

describe("path-service-mock", () => {
  it("derives dev config, data, and cache paths from XDG roots", () => {
    const pathService = makePathServiceMock({
      homeDir: "/home/user",
      xdgConfigHome: "/xdg/config",
      xdgDataHome: "/xdg/data",
      xdgCacheHome: "/xdg/cache",
    });

    expect(pathService.configDir).toBe("/xdg/config/dev");
    expect(pathService.configPath).toBe("/xdg/config/dev/config.json");
    expect(pathService.dataDir).toBe("/xdg/data/dev");
    expect(pathService.dbPath).toBe("/xdg/data/dev/dev.db");
    expect(pathService.cacheDir).toBe("/xdg/cache/dev");
    expect(pathService.devDir).toBe("/home/user/.dev");
  });

  it("lets explicit path overrides win over derived XDG paths", () => {
    const pathService = makePathServiceMock({
      homeDir: "/home/user",
      xdgConfigHome: "/xdg/config",
      configDir: "/custom/config/dev",
      configPath: "/custom/config/dev/custom.json",
      dataDir: "/custom/data/dev",
      dbPath: "/custom/data/dev/custom.db",
      cacheDir: "/custom/cache/dev",
    });

    expect(pathService.configDir).toBe("/custom/config/dev");
    expect(pathService.configPath).toBe("/custom/config/dev/custom.json");
    expect(pathService.dataDir).toBe("/custom/data/dev");
    expect(pathService.dbPath).toBe("/custom/data/dev/custom.db");
    expect(pathService.cacheDir).toBe("/custom/cache/dev");
  });
});
