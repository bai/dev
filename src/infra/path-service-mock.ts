import type { Config } from "../domain/config-schema";
import type { PathService } from "../domain/path-service";

export const makePathServiceMock = (
  overrides: {
    readonly homeDir?: string;
    readonly baseSearchPath?: string;
    readonly devDir?: string;
    readonly configDir?: string;
    readonly configPath?: string;
    readonly dataDir?: string;
    readonly dbPath?: string;
    readonly cacheDir?: string;
  } = {},
): PathService => {
  const homeDir = overrides.homeDir ?? "/home/user";
  const baseSearchPath = overrides.baseSearchPath ?? `${homeDir}/src`;
  const devDir = overrides.devDir ?? `${homeDir}/.dev`;
  const configDir = overrides.configDir ?? `${homeDir}/.config/dev`;
  const configPath = overrides.configPath ?? `${configDir}/config.json`;
  const dataDir = overrides.dataDir ?? `${homeDir}/.local/share/dev`;
  const dbPath = overrides.dbPath ?? `${dataDir}/dev.db`;
  const cacheDir = overrides.cacheDir ?? `${homeDir}/.cache/dev`;

  return {
    homeDir,
    baseSearchPath,
    devDir,
    configDir,
    configPath,
    dataDir,
    dbPath,
    cacheDir,
    getBasePath: (_config: Config) => baseSearchPath,
  };
};
