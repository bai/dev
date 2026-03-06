import { Effect, Layer } from "effect";

import { FileSystemTag, type FileSystem } from "~/capabilities/system/file-system-port";
import { NetworkTag, type Network } from "~/capabilities/system/network-port";
import { ConfigLoaderTag, type ConfigLoader } from "~/core/config/config-loader-port";
import { configSchema, type Config } from "~/core/config/config-schema";
import { configError, type ConfigError, type FileSystemError, type NetworkError, type UnknownError } from "~/core/errors";
import { annotateErrorTypeOnFailure } from "~/core/observability/error-type";
import { HostPathsTag } from "~/core/runtime/path-service";

export const ConfigLoaderLiveLayer = Layer.effect(
  ConfigLoaderTag,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystemTag;
    const network = yield* NetworkTag;
    const hostPaths = yield* HostPathsTag;
    const configPath = hostPaths.configPath;
    const parse = (content: string, source = "config"): Effect.Effect<Config, ConfigError> =>
      Effect.try({
        try: () => {
          const rawConfig = Bun.JSONC.parse(content);
          return configSchema.parse(rawConfig);
        },
        catch: (error) => configError(`Invalid ${source}: ${error}`),
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
                return configError(`Failed to fetch remote config: ${response.status} ${response.statusText}`);
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
    } satisfies ConfigLoader;
  }),
);
