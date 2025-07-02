import { Context, Effect, Layer } from "effect";

import { configError, unknownError, type ConfigError, type NetworkError, type UnknownError } from "../domain/errors";
import { FileSystemService, type FileSystem } from "../domain/ports/FileSystem";
import { NetworkService, type Network } from "../domain/ports/Network";
import { migrateConfig } from "./migrations";
import { configSchema, defaultConfig, type Config } from "./schema";

export interface ConfigLoader {
  load(): Effect.Effect<Config, ConfigError | UnknownError>;
  save(config: Config): Effect.Effect<void, ConfigError | UnknownError>;
  refresh(): Effect.Effect<Config, ConfigError | NetworkError | UnknownError>;
}

export class ConfigLoaderLive implements ConfigLoader {
  constructor(
    private fileSystem: FileSystem,
    private network: Network,
    private configPath: string,
  ) {}

  load(): Effect.Effect<Config, ConfigError | UnknownError> {
    return this.fileSystem.exists(this.configPath).pipe(
      Effect.flatMap((exists) => {
        if (!exists) {
          // Create default config if it doesn't exist
          return this.save(defaultConfig).pipe(Effect.map(() => defaultConfig));
        }

        return this.fileSystem.readFile(this.configPath).pipe(
          Effect.flatMap((content) => {
            try {
              const rawConfig = JSON.parse(content);
              const migratedConfig = migrateConfig(rawConfig);
              const validatedConfig = configSchema.parse(migratedConfig);
              return Effect.succeed(validatedConfig);
            } catch (error) {
              return Effect.fail(configError(`Invalid config file: ${error}`));
            }
          }),
        );
      }),
    );
  }

  save(config: Config): Effect.Effect<void, ConfigError | UnknownError> {
    const content = JSON.stringify(config, null, 2);
    return this.fileSystem.writeFile(this.configPath, content);
  }

  refresh(): Effect.Effect<Config, ConfigError | NetworkError | UnknownError> {
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

            try {
              const remoteConfig = JSON.parse(response.body);
              const migratedConfig = migrateConfig(remoteConfig);
              const validatedConfig = configSchema.parse(migratedConfig);

              // Save the updated config
              return this.save(validatedConfig).pipe(Effect.map(() => validatedConfig));
            } catch (error) {
              return Effect.fail(configError(`Invalid remote config: ${error}`));
            }
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
