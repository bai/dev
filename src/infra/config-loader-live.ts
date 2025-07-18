import { Effect, Layer } from "effect";

import { ConfigLoaderTag, type ConfigLoader } from "../domain/config-loader-port";
import { configSchema, type Config } from "../domain/config-schema";
import {
  configError,
  type ConfigError,
  type FileSystemError,
  type NetworkError,
  type UnknownError,
} from "../domain/errors";
import { FileSystemTag, type FileSystem } from "../domain/file-system-port";
import { NetworkTag, type Network } from "../domain/network-port";

// Factory function that creates ConfigLoader with dependencies
export const makeConfigLoaderLive = (fileSystem: FileSystem, network: Network, configPath: string): ConfigLoader => {
  // Individual functions implementing the service methods
  const load = (): Effect.Effect<Config, ConfigError | FileSystemError | UnknownError> =>
    fileSystem.exists(configPath).pipe(
      Effect.flatMap((exists) => {
        if (!exists) {
          // Create a new config with all defaults from the schema
          const newConfig = configSchema.parse({});
          return save(newConfig).pipe(Effect.map(() => newConfig));
        }
        return fileSystem.readFile(configPath).pipe(
          Effect.flatMap((content) =>
            Effect.try({
              try: () => {
                const rawConfig = JSON.parse(content);
                return configSchema.parse(rawConfig);
              },
              catch: (error) => configError(`Invalid config file: ${error}`),
            }),
          ),
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
                return configSchema.parse(remoteConfig);
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

// Effect Layer for dependency injection using factory function
export const ConfigLoaderLiveLayer = (configPath: string) =>
  Layer.effect(
    ConfigLoaderTag,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystemTag;
      const network = yield* NetworkTag;
      return makeConfigLoaderLive(fileSystem, network, configPath);
    }),
  );
