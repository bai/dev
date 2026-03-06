import { describe, expect, it } from "vitest";

import {
  makeEnvironmentPathsMock,
  makeInstallPathsMock,
  makeStatePathsMock,
  makeWorkspacePathsMock,
} from "~/core/runtime/path-service-mock";

describe("path-service-mock", () => {
  it("derives environment paths from the provided home and cwd", () => {
    const environmentPaths = makeEnvironmentPathsMock({
      homeDir: "/home/user",
      cwd: "/workspace",
      xdgConfigHome: "/xdg/config",
    });

    expect(environmentPaths.homeDir).toBe("/home/user");
    expect(environmentPaths.cwd).toBe("/workspace");
    expect(environmentPaths.xdgConfigHome).toBe("/xdg/config");
    expect(environmentPaths.resolveUserPath("~/src")).toBe("/home/user/src");
  });

  it("derives app-owned state paths under ~/.dev/state by default", () => {
    const statePaths = makeStatePathsMock();

    expect(statePaths.stateDir).toBe("/home/user/.dev/state");
    expect(statePaths.configPath).toBe("/home/user/.dev/state/config.json");
    expect(statePaths.dbPath).toBe("/home/user/.dev/state/dev.db");
    expect(statePaths.cacheDir).toBe("/home/user/.dev/state/cache");
    expect(statePaths.dockerDir).toBe("/home/user/.dev/state/docker");
    expect(statePaths.runDir).toBe("/home/user/.dev/state/run");
  });

  it("lets explicit state path overrides win over defaults", () => {
    const statePaths = makeStatePathsMock({
      stateDir: "/custom/state",
      configPath: "/custom/config/dev.json",
      dbPath: "/custom/data/dev.db",
      cacheDir: "/custom/cache",
      dockerDir: "/custom/docker",
      runDir: "/custom/run",
    });

    expect(statePaths.stateDir).toBe("/custom/state");
    expect(statePaths.configPath).toBe("/custom/config/dev.json");
    expect(statePaths.dbPath).toBe("/custom/data/dev.db");
    expect(statePaths.cacheDir).toBe("/custom/cache");
    expect(statePaths.dockerDir).toBe("/custom/docker");
    expect(statePaths.runDir).toBe("/custom/run");
  });

  it("creates repo-mode install paths by default", () => {
    const installPaths = makeInstallPathsMock();

    expect(installPaths.installMode).toBe("repo");
    expect(installPaths.installDir).toBe("/home/user/.dev");
    expect(installPaths.upgradeCapable).toBe(true);
  });

  it("creates workspace paths independently from install and state paths", () => {
    const workspacePaths = makeWorkspacePathsMock("/workspace/src");

    expect(workspacePaths.baseSearchPath).toBe("/workspace/src");
  });
});
