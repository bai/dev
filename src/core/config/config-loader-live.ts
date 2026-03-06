import { Effect, Layer } from "effect";

import { FileSystem, type FileSystemService } from "~/capabilities/system/file-system-port";
import { Network, type NetworkService } from "~/capabilities/system/network-port";
import { ConfigLoader, type ConfigLoaderService } from "~/core/config/config-loader-port";
import { configSchema, type Config } from "~/core/config/config-schema";
import { ConfigError, type FileSystemError, type NetworkError, type UnknownError } from "~/core/errors";
import { annotateErrorTypeOnFailure } from "~/core/observability/error-type";
import { StatePaths } from "~/core/runtime/path-service";

export const ConfigLoaderLiveLayer = Layer.effect(
  ConfigLoader,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    const network = yield* Network;
    const statePaths = yield* StatePaths;
    const configPath = statePaths.configPath;
    const parse = (content: string, source = "config"): Effect.Effect<Config, ConfigError> =>
      Effect.try({
        try: () => {
          const rawConfig = Bun.JSONC.parse(content);
          return configSchema.parse(rawConfig);
        },
        catch: (error) => new ConfigError({ message: `Invalid ${source}: ${error}` }),
      });

    const save = (config: Config): Effect.Effect<void, FileSystemError | UnknownError> =>
      fileSystem.writeFile(configPath, JSON.stringify(config, null, 2)).pipe(annotateErrorTypeOnFailure, Effect.withSpan("config.save"));

    const load = (): Effect.Effect<Config, ConfigError | FileSystemError | UnknownError> =>
      fileSystem.exists(configPath).pipe(
        Effect.flatMap((exists) => {
          if (!exists) {
            const newConfig = configSchema.parse({});
            return save(newConfig).pipe(Effect.map(() => newConfig));
          }
          return fileSystem.readFile(configPath).pipe(Effect.flatMap((content) => parse(content, "config file")));
        }),
        annotateErrorTypeOnFailure,
        Effect.withSpan("config.load", { attributes: { "config.path": configPath } }),
      );

    const refresh = (): Effect.Effect<Config, ConfigError | FileSystemError | NetworkError | UnknownError> =>
      load().pipe(
        Effect.flatMap((currentConfig) => {
          if (!currentConfig.configUrl) {
            return Effect.succeed(currentConfig);
          }

          return network.get(currentConfig.configUrl).pipe(
            Effect.flatMap((response) => {
              if (response.status !== 200) {
                return new ConfigError({ message: `Failed to fetch remote config: ${response.status} ${response.statusText}` });
              }

              return parse(response.body, "remote config").pipe(
                Effect.flatMap((validatedConfig) => save(validatedConfig).pipe(Effect.map(() => validatedConfig))),
              );
            }),
          );
        }),
        annotateErrorTypeOnFailure,
        Effect.withSpan("config.refresh"),
      );

    return {
      parse,
      load,
      save,
      refresh,
    } satisfies ConfigLoaderService;
  }),
);
