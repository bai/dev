import { Context, Effect, Layer } from "effect";

import {
  configError,
  type ConfigError,
  type FileSystemError,
  type NetworkError,
  type UnknownError,
} from "../domain/errors";
import { FileSystemService, type FileSystem } from "../domain/ports/FileSystem";
import { NetworkService, type Network } from "../domain/ports/Network";
import { migrateConfig } from "./migrations";
import { configSchema, defaultConfig, type Config } from "./schema";

export interface ConfigLoader {
  load(): Effect.Effect<Config, ConfigError | FileSystemError | UnknownError>;
  save(config: Config): Effect.Effect<void, FileSystemError | UnknownError>;
  refresh(): Effect.Effect<Config, ConfigError | FileSystemError | NetworkError | UnknownError>;
}

export class ConfigLoaderLive implements ConfigLoader {
  constructor(
    private fileSystem: FileSystem,
    private network: Network,
    private configPath: string,
  ) {}

  load(): Effect.Effect<Config, ConfigError | FileSystemError | UnknownError> {
    return this.fileSystem.exists(this.configPath).pipe(
      Effect.flatMap((exists) => {
        if (!exists) {
          // Create default config if it doesn't exist
          return this.save(defaultConfig).pipe(Effect.map(() => defaultConfig));
        }

        return this.fileSystem.readFile(this.configPath).pipe(
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
  }

  save(config: Config): Effect.Effect<void, FileSystemError | UnknownError> {
    const content = JSON.stringify(config, null, 2);
    return this.fileSystem.writeFile(this.configPath, content);
  }

  refresh(): Effect.Effect<Config, ConfigError | FileSystemError | NetworkError | UnknownError> {
    return this.load().pipe(
      Effect.flatMap((currentConfig) => {
        if (!currentConfig.configUrl) {
          return Effect.succeed(currentConfig);
        }

        return this.network.get(currentConfig.configUrl).pipe(
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
            }).pipe(
              Effect.flatMap((validatedConfig) => this.save(validatedConfig).pipe(Effect.map(() => validatedConfig))),
            );
          }),
          // Fall back to current config if remote fetch fails
          Effect.catchAll(() => Effect.succeed(currentConfig)),
        );
      }),
    );
  }
}

// Service tag for Effect Context system
export class ConfigLoaderService extends Context.Tag("ConfigLoaderService")<ConfigLoaderService, ConfigLoader>() {}

// Effect Layer for dependency injection
export const ConfigLoaderLiveLayer = (configPath: string) =>
  Layer.effect(
    ConfigLoaderService,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystemService;
      const network = yield* NetworkService;
      return new ConfigLoaderLive(fileSystem, network, configPath);
    }),
  );
