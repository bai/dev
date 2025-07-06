import { Context, Effect, Layer } from "effect";

import {
  configError,
  type ConfigError,
  type FileSystemError,
  type NetworkError,
  type UnknownError,
} from "../domain/errors";
import { FileSystemPortTag, type FileSystemPort } from "../domain/ports/file-system-port";
import { NetworkPortTag, type NetworkPort } from "../domain/ports/network-port";
import { migrateConfig } from "./migrations";
import { configSchema, defaultConfig, type Config } from "./schema";

export interface ConfigLoader {
  load(): Effect.Effect<Config, ConfigError | FileSystemError | UnknownError>;
  save(config: Config): Effect.Effect<void, FileSystemError | UnknownError>;
  refresh(): Effect.Effect<Config, ConfigError | FileSystemError | NetworkError | UnknownError>;
}

// Factory function that creates ConfigLoader with dependencies
export const makeConfigLoaderLive = (
  fileSystem: FileSystemPort,
  network: NetworkPort,
  configPath: string,
): ConfigLoader => {
  // Individual functions implementing the service methods
  const load = (): Effect.Effect<Config, ConfigError | FileSystemError | UnknownError> =>
    fileSystem.exists(configPath).pipe(
      Effect.flatMap((exists) => {
        if (!exists) {
          // Create default config if it doesn't exist
          return save(defaultConfig).pipe(Effect.map(() => defaultConfig));
        }

        return fileSystem.readFile(configPath).pipe(
          Effect.flatMap((content) => {
            return Effect.try({
              try: () => {
                const rawConfig = JSON.parse(content);
                const migratedConfig = migrateConfig(rawConfig);
                return configSchema.parse(migratedConfig);
              },
              catch: (error) => configError(`Invalid config file: ${error}`),
            });
          }),
        );
      }),
    );

  const save = (config: Config): Effect.Effect<void, FileSystemError | UnknownError> => {
    const content = JSON.stringify(config, null, 2);
    return fileSystem.writeFile(configPath, content);
  };

  const refresh = (): Effect.Effect<Config, ConfigError | FileSystemError | NetworkError | UnknownError> =>
    load().pipe(
      Effect.flatMap((currentConfig) => {
        if (!currentConfig.configUrl) {
          return Effect.succeed(currentConfig);
        }

        return network.get(currentConfig.configUrl).pipe(
          Effect.flatMap((response) => {
            if (response.status !== 200) {
              return Effect.fail(
                configError(`Failed to fetch remote config: ${response.status} ${response.statusText}`),
              );
            }

            return Effect.try({
              try: () => {
                const remoteConfig = JSON.parse(response.body);
                const migratedConfig = migrateConfig(remoteConfig);
                return configSchema.parse(migratedConfig);
              },
              catch: (error) => configError(`Invalid remote config: ${error}`),
            }).pipe(Effect.flatMap((validatedConfig) => save(validatedConfig).pipe(Effect.map(() => validatedConfig))));
          }),
          // Fall back to current config if remote fetch fails
          Effect.catchAll(() => Effect.succeed(currentConfig)),
        );
      }),
    );

  return {
    load,
    save,
    refresh,
  };
};

// Service tag for Effect Context system
export class ConfigLoaderTag extends Context.Tag("ConfigLoader")<ConfigLoaderTag, ConfigLoader>() {}

// Effect Layer for dependency injection using factory function
export const ConfigLoaderLiveLayer = (configPath: string) =>
  Layer.effect(
    ConfigLoaderTag,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystemPortTag;
      const network = yield* NetworkPortTag;
      return makeConfigLoaderLive(fileSystem, network, configPath);
    }),
  );
