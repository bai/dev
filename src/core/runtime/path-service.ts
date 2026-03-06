import path from "path";

import { Effect } from "effect";

export const DEFAULT_BASE_SEARCH_DIR = "src";
export const DEFAULT_INSTALL_DIR = "~/.dev";
export const DEFAULT_STATE_DIR = "~/.dev/state";

export interface PathRuntime {
  readonly homeDir: string;
  readonly cwd: string;
  readonly xdgConfigHome: string;
  readonly argv: readonly string[];
  readonly execPath: string;
  readonly devInstallDir?: string;
  readonly devStateDir?: string;
}

export type InstallMode = "repo" | "binary";

export class EnvironmentPathsTag extends Effect.Tag("EnvironmentPaths")<
  EnvironmentPathsTag,
  {
    readonly homeDir: string;
    readonly cwd: string;
    readonly xdgConfigHome: string;
    resolveUserPath(filePath: string): string;
  }
>() {}

export type EnvironmentPaths = (typeof EnvironmentPathsTag)["Service"];

export class InstallPathsTag extends Effect.Tag("InstallPaths")<
  InstallPathsTag,
  {
    readonly installMode: InstallMode;
    readonly installDir: string;
    readonly upgradeCapable: boolean;
  }
>() {}

export type InstallPaths = (typeof InstallPathsTag)["Service"];

export class StatePathsTag extends Effect.Tag("StatePaths")<
  StatePathsTag,
  {
    readonly stateDir: string;
    readonly configPath: string;
    readonly dbPath: string;
    readonly cacheDir: string;
    readonly dockerDir: string;
    readonly runDir: string;
  }
>() {}

export type StatePaths = (typeof StatePathsTag)["Service"];

export class WorkspacePathsTag extends Effect.Tag("WorkspacePaths")<
  WorkspacePathsTag,
  {
    readonly baseSearchPath: string;
  }
>() {}

export type WorkspacePaths = (typeof WorkspacePathsTag)["Service"];

export const resolveUserPath = (filePath: string, runtime: Pick<PathRuntime, "homeDir" | "cwd">): string => {
  if (filePath.startsWith("~/")) {
    return path.join(runtime.homeDir, filePath.slice(2));
  }
  if (filePath === "~") {
    return runtime.homeDir;
  }
  return path.resolve(runtime.cwd, filePath);
};

export const isBundledBinaryInvocation = (argv: readonly string[], execPath: string): boolean => {
  const scriptPath = argv[1];
  return Boolean(execPath && scriptPath && (scriptPath === execPath || scriptPath.startsWith("/$bunfs/")));
};

export const resolveRepoInstallDirFromArgv = (argv: readonly string[]): string | null => {
  const scriptPath = argv[1];

  if (!scriptPath || scriptPath.startsWith("/$bunfs/")) {
    return null;
  }

  return path.resolve(scriptPath, "..", "..");
};

export const createEnvironmentPaths = (runtime: Pick<PathRuntime, "homeDir" | "cwd" | "xdgConfigHome">): EnvironmentPaths => ({
  homeDir: runtime.homeDir,
  cwd: runtime.cwd,
  xdgConfigHome: runtime.xdgConfigHome,
  resolveUserPath: (filePath) => resolveUserPath(filePath, runtime),
});

export const createInstallPaths = (
  runtime: PathRuntime,
  overrides: {
    readonly installDir?: string;
    readonly installMode?: InstallMode;
    readonly upgradeCapable?: boolean;
  } = {},
): InstallPaths => {
  const inferredInstallMode = isBundledBinaryInvocation(runtime.argv, runtime.execPath) ? "binary" : "repo";
  const installMode = overrides.installMode ?? inferredInstallMode;
  const inferredInstallDir =
    installMode === "repo"
      ? (resolveRepoInstallDirFromArgv(runtime.argv) ?? DEFAULT_INSTALL_DIR)
      : path.dirname(runtime.execPath || runtime.cwd);

  return {
    installMode,
    installDir: resolveUserPath(overrides.installDir ?? runtime.devInstallDir ?? inferredInstallDir, runtime),
    upgradeCapable: overrides.upgradeCapable ?? installMode === "repo",
  };
};

export const createStatePaths = (
  runtime: Pick<PathRuntime, "homeDir" | "cwd" | "devStateDir">,
  overrides: {
    readonly stateDir?: string;
    readonly configPath?: string;
  } = {},
): StatePaths => {
  const stateDir = resolveUserPath(overrides.stateDir ?? runtime.devStateDir ?? DEFAULT_STATE_DIR, runtime);
  return {
    stateDir,
    configPath: overrides.configPath ? resolveUserPath(overrides.configPath, runtime) : path.join(stateDir, "config.json"),
    dbPath: path.join(stateDir, "dev.db"),
    cacheDir: path.join(stateDir, "cache"),
    dockerDir: path.join(stateDir, "docker"),
    runDir: path.join(stateDir, "run"),
  };
};

export const createWorkspacePaths = (
  environmentPaths: Pick<EnvironmentPaths, "homeDir" | "resolveUserPath">,
  baseSearchPath?: string,
): WorkspacePaths => ({
  baseSearchPath: environmentPaths.resolveUserPath(baseSearchPath ?? path.join(environmentPaths.homeDir, DEFAULT_BASE_SEARCH_DIR)),
});
