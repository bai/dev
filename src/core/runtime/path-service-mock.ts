import path from "path";

import {
  type EnvironmentPathsService,
  type InstallPathsService,
  type StatePathsService,
  type WorkspacePathsService,
} from "~/core/runtime/path-service";

const resolveMockUserPath = (filePath: string, runtime: { readonly homeDir: string; readonly cwd: string }): string => {
  if (filePath.startsWith("~/")) {
    return path.join(runtime.homeDir, filePath.slice(2));
  }
  if (filePath === "~") {
    return runtime.homeDir;
  }
  return path.resolve(runtime.cwd, filePath);
};

export const makeEnvironmentPathsMock = (
  overrides: {
    readonly homeDir?: string;
    readonly cwd?: string;
    readonly xdgConfigHome?: string;
  } = {},
): EnvironmentPathsService => {
  const homeDir = overrides.homeDir ?? "/home/user";
  const cwd = overrides.cwd ?? homeDir;
  return {
    homeDir,
    cwd,
    xdgConfigHome: overrides.xdgConfigHome ?? `${homeDir}/.config`,
    resolveUserPath: (filePath) => resolveMockUserPath(filePath, { homeDir, cwd }),
  };
};

export const makeInstallPathsMock = (
  overrides: {
    readonly installMode?: InstallPathsService["installMode"];
    readonly installDir?: string;
    readonly upgradeCapable?: boolean;
  } = {},
): InstallPathsService => {
  const installMode = overrides.installMode ?? "repo";
  return {
    installMode,
    installDir: overrides.installDir ?? "/home/user/.dev",
    upgradeCapable: overrides.upgradeCapable ?? installMode === "repo",
  };
};

export const makeStatePathsMock = (
  overrides: {
    readonly stateDir?: string;
    readonly configPath?: string;
    readonly dbPath?: string;
    readonly cacheDir?: string;
    readonly dockerDir?: string;
    readonly runDir?: string;
  } = {},
): StatePathsService => {
  const stateDir = overrides.stateDir ?? "/home/user/.dev/state";
  return {
    stateDir,
    configPath: overrides.configPath ?? path.join(stateDir, "config.json"),
    dbPath: overrides.dbPath ?? path.join(stateDir, "dev.db"),
    cacheDir: overrides.cacheDir ?? path.join(stateDir, "cache"),
    dockerDir: overrides.dockerDir ?? path.join(stateDir, "docker"),
    runDir: overrides.runDir ?? path.join(stateDir, "run"),
  };
};

export const makeWorkspacePathsMock = (baseSearchPath = "/home/user/src"): WorkspacePathsService => ({
  baseSearchPath,
});
