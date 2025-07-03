import { Effect, Layer } from "effect";

import { networkError, unknownError, type NetworkError, type UnknownError } from "../../domain/errors";
import { FileSystemService, type FileSystem } from "../../domain/ports/FileSystem";
import { NetworkService, type HttpResponse, type Network } from "../../domain/ports/Network";

export class NetworkLive implements Network {
  constructor(private fileSystem: FileSystem) {}

  get(
    url: string,
    options: { headers?: Record<string, string> } = {},
  ): Effect.Effect<HttpResponse, NetworkError | UnknownError> {
    return Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, {
          method: "GET",
          headers: options.headers,
        });

        const body = await response.text();
        const headers: Record<string, string> = {};

        response.headers.forEach((value, key) => {
          headers[key] = value;
        });

        return {
          status: response.status,
          statusText: response.statusText,
          body,
          headers,
        };
      },
      catch: (error) => networkError(`HTTP request failed: ${error}`),
    });
  }

  downloadFile(url: string, destinationPath: string): Effect.Effect<void, NetworkError | UnknownError> {
    const fileSystem = this.fileSystem;
    return Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () => fetch(url),
        catch: (error) => networkError(`Failed to fetch ${url}: ${error}`),
      });

      if (!response.ok) {
        return yield* Effect.fail(networkError(`HTTP ${response.status}: ${response.statusText}`));
      }

      const content = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) => networkError(`Failed to read response body: ${error}`),
      });

      yield* fileSystem
        .writeFile(destinationPath, content)
        .pipe(
          Effect.mapError((error) =>
            error._tag === "FileSystemError"
              ? networkError(`Failed to write file: ${error.reason}`)
              : networkError(`Failed to write file: ${error}`),
          ),
        );
    });
  }

  checkConnectivity(url: string): Effect.Effect<boolean> {
    return Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, { method: "HEAD" });
        return response.ok;
      },
      catch: () => false,
    }).pipe(Effect.catchAll(() => Effect.succeed(false)));
  }
}

// Effect Layer for dependency injection
export const NetworkLiveLayer = Layer.effect(
  NetworkService,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystemService;
    return new NetworkLive(fileSystem);
  }),
);
