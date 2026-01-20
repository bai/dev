import { Effect, Layer } from "effect";

import { networkError, type NetworkError, type UnknownError } from "../domain/errors";
import { FileSystemTag, type FileSystem } from "../domain/file-system-port";
import { NetworkTag, type HttpResponse, type Network } from "../domain/network-port";

// Factory function to create Network implementation
export const makeNetworkLive = (fileSystem: FileSystem): Network => ({
  get: (
    url: string,
    options: { headers?: Record<string, string> } = {},
  ): Effect.Effect<HttpResponse, NetworkError | UnknownError> =>
    Effect.tryPromise({
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
    }),

  downloadFile: (url: string, destinationPath: string): Effect.Effect<void, NetworkError | UnknownError> =>
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () => fetch(url),
        catch: (error) => networkError(`Failed to fetch ${url}: ${error}`),
      });

      if (!response.ok) {
        return yield* networkError(`HTTP ${response.status}: ${response.statusText}`);
      }

      const content = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (error) => networkError(`Failed to read response body: ${error}`),
      });

      yield* fileSystem.writeFile(destinationPath, content).pipe(
        Effect.mapError((error) => {
          switch (error._tag) {
            case "FileSystemError":
              return networkError(`Failed to write file: ${error.reason}`);
            case "UnknownError":
              return networkError(`Failed to write file: ${String(error.reason)}`);
            default:
              return networkError(`Failed to write file: ${error}`);
          }
        }),
      );
    }),

  checkConnectivity: (url: string): Effect.Effect<boolean> =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(url, { method: "HEAD" });
        return response.ok;
      },
      catch: () => false,
    }).pipe(Effect.catchAll(() => Effect.succeed(false))),
});

// Effect Layer for dependency injection
export const NetworkLiveLayer = Layer.effect(
  NetworkTag,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystemTag;
    return makeNetworkLive(fileSystem);
  }),
);
