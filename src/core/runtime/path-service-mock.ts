import path from "path";

import { type HostPaths, type WorkspacePaths } from "~/core/runtime/path-service";

const resolveMockUserPath = (filePath: string, runtime: { readonly homeDir: string; readonly cwd: string }): string => {
  if (filePath.startsWith("~/")) {
    return path.join(runtime.homeDir, filePath.slice(2));
  }
  if (filePath === "~") {
    return runtime.homeDir;
  }
  return path.resolve(runtime.cwd, filePath);
};

export const makeHostPathsMock = (
  overrides: {
    readonly homeDir?: string;
    readonly cwd?: string;
    readonly xdgConfigHome?: string;
    readonly xdgDataHome?: string;
    readonly xdgCacheHome?: string;
    readonly devDir?: string;
    readonly configDir?: string;
    readonly configPath?: string;
    readonly dataDir?: string;
    readonly dbPath?: string;
    readonly cacheDir?: string;
  } = {},
): HostPaths => {
  const homeDir = overrides.homeDir ?? "/home/user";
  const cwd = overrides.cwd ?? homeDir;
  const xdgConfigHome = overrides.xdgConfigHome ?? `${homeDir}/.config`;
  const xdgDataHome = overrides.xdgDataHome ?? `${homeDir}/.local/share`;
  const xdgCacheHome = overrides.xdgCacheHome ?? `${homeDir}/.cache`;
  const configPath =
    overrides.configPath ??
    (overrides.configDir ? path.join(overrides.configDir, "config.json") : path.join(xdgConfigHome, "dev", "config.json"));
  const configDir = overrides.configDir ?? path.dirname(configPath);
  const dataDir = overrides.dataDir ?? path.join(xdgDataHome, "dev");
  const dbPath = overrides.dbPath ?? path.join(dataDir, "dev.db");
  const cacheDir = overrides.cacheDir ?? path.join(xdgCacheHome, "dev");

  return {
    homeDir,
    cwd,
    devDir: overrides.devDir ?? `${homeDir}/.dev`,
    configDir,
    configPath,
    dataDir,
    dbPath,
    cacheDir,
    resolveUserPath: (filePath) => resolveMockUserPath(filePath, { homeDir, cwd }),
  };
};

export const makeWorkspacePathsMock = (baseSearchPath = "/home/user/src"): WorkspacePaths => ({
  baseSearchPath,
});
