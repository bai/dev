import { configError, type DevError } from "../domain/errors";

// Migration functions
export type ConfigMigration = (config: any) => any | DevError;

// Individual migration functions
const migrate1to2: ConfigMigration = (config: any) => {
  // Example migration from v1 to v2
  return {
    ...config,
    version: 2,
    telemetry: config.telemetry || { enabled: true },
  };
};

const migrate2to3: ConfigMigration = (config: any) => {
  // Migration from v2 to v3 - add plugins
  return {
    ...config,
    version: 3,
    plugins: config.plugins || { git: [] },
  };
};

// Migration chain
const migrations: Record<number, ConfigMigration> = {
  1: migrate1to2,
  2: migrate2to3,
};

export function migrateConfig(config: any): any | DevError {
  if (!config || typeof config !== "object") {
    return configError("Config must be an object");
  }

  let currentConfig = { ...config };
  const currentVersion = currentConfig.version || 1;
  const targetVersion = 3;

  // Apply migrations in sequence
  for (let version = currentVersion; version < targetVersion; version++) {
    const migration = migrations[version];
    if (!migration) {
      return configError(`No migration available from version ${version} to ${version + 1}`);
    }

    const result = migration(currentConfig);
    if (typeof result === "object" && "_tag" in result) {
      return result; // Migration error
    }

    currentConfig = result;
  }

  return currentConfig;
}
