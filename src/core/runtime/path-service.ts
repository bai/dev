import path from "path";

import { Effect } from "effect";

export const DEFAULT_BASE_SEARCH_DIR = "src";
const DEFAULT_DEV_DIR = ".dev";

export interface HostPathsRuntime {
  readonly homeDir: string;
  readonly xdgConfigHome: string;
  readonly xdgDataHome: string;
  readonly xdgCacheHome: string;
  readonly cwd: string;
}

export class HostPathsTag extends Effect.Tag("HostPaths")<
  HostPathsTag,
  {
    readonly homeDir: string;
    readonly cwd: string;
    readonly devDir: string;
    readonly configDir: string;
    readonly configPath: string;
    readonly dataDir: string;
    readonly dbPath: string;
    readonly cacheDir: string;
    resolveUserPath(filePath: string): string;
  }
>() {}

export type HostPaths = (typeof HostPathsTag)["Service"];

export class WorkspacePathsTag extends Effect.Tag("WorkspacePaths")<
  WorkspacePathsTag,
  {
    readonly baseSearchPath: string;
  }
>() {}

export type WorkspacePaths = (typeof WorkspacePathsTag)["Service"];

export const resolveUserPath = (filePath: string, runtime: Pick<HostPathsRuntime, "homeDir" | "cwd">): string => {
  if (filePath.startsWith("~/")) {
    return path.join(runtime.homeDir, filePath.slice(2));
  }
  if (filePath === "~") {
    return runtime.homeDir;
  }
  return path.resolve(runtime.cwd, filePath);
};

export const createHostPaths = (runtime: HostPathsRuntime, overrides: { readonly configPath?: string } = {}): HostPaths => {
  const configPath = overrides.configPath
    ? resolveUserPath(overrides.configPath, runtime)
    : path.join(runtime.xdgConfigHome, "dev", "config.json");

  return {
    homeDir: runtime.homeDir,
    cwd: runtime.cwd,
    devDir: path.join(runtime.homeDir, DEFAULT_DEV_DIR),
    configDir: path.dirname(configPath),
    configPath,
    dataDir: path.join(runtime.xdgDataHome, "dev"),
    dbPath: path.join(runtime.xdgDataHome, "dev", "dev.db"),
    cacheDir: path.join(runtime.xdgCacheHome, "dev"),
    resolveUserPath: (filePath) => resolveUserPath(filePath, runtime),
  };
};

export const createWorkspacePaths = (
  hostPaths: Pick<HostPaths, "homeDir" | "resolveUserPath">,
  baseSearchPath?: string,
): WorkspacePaths => ({
  baseSearchPath: hostPaths.resolveUserPath(baseSearchPath ?? path.join(hostPaths.homeDir, DEFAULT_BASE_SEARCH_DIR)),
});
