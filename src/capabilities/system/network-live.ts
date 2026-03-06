import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  ATTR_URL_FULL,
  HTTP_REQUEST_METHOD_VALUE_GET,
  HTTP_REQUEST_METHOD_VALUE_HEAD,
} from "@opentelemetry/semantic-conventions";
import { ATTR_FILE_PATH } from "@opentelemetry/semantic-conventions/incubating";
import { Effect, Layer } from "effect";

import { FileSystem, type FileSystemService } from "~/capabilities/system/file-system-port";
import { Network, type HttpResponse, type NetworkService } from "~/capabilities/system/network-port";
import { NetworkError, type UnknownError } from "~/core/errors";
import { annotateErrorTypeOnFailure } from "~/core/observability/error-type";

const createHttpClientSpanAttributes = (url: string, method: string): Record<string, string | number> => {
  if (!URL.canParse(url)) {
    return {
      [ATTR_URL_FULL]: url,
      [ATTR_HTTP_REQUEST_METHOD]: method,
    };
  }

  const parsedUrl = new URL(url);
  return {
    [ATTR_URL_FULL]: url,
    [ATTR_HTTP_REQUEST_METHOD]: method,
    [ATTR_SERVER_ADDRESS]: parsedUrl.hostname,
    ...(parsedUrl.port ? { [ATTR_SERVER_PORT]: Number(parsedUrl.port) } : {}),
  };
};

export const NetworkLiveLayer = Layer.effect(
  Network,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;
    return {
      get: (url: string, options: { headers?: Record<string, string> } = {}): Effect.Effect<HttpResponse, NetworkError | UnknownError> =>
        Effect.gen(function* () {
          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(url, {
                method: HTTP_REQUEST_METHOD_VALUE_GET,
                headers: options.headers,
              }),
            catch: (error) => new NetworkError({ message: `HTTP request failed: ${error}` }),
          });

          yield* Effect.annotateCurrentSpan(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);

          const body = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: (error) => new NetworkError({ message: `Failed to read response body: ${error}` }),
          });

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
        }).pipe(
          annotateErrorTypeOnFailure,
          Effect.withSpan("http.get", { attributes: createHttpClientSpanAttributes(url, HTTP_REQUEST_METHOD_VALUE_GET) }),
        ),
      downloadFile: (url: string, destinationPath: string): Effect.Effect<void, NetworkError | UnknownError> =>
        Effect.gen(function* () {
          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(url, {
                method: HTTP_REQUEST_METHOD_VALUE_GET,
              }),
            catch: (error) => new NetworkError({ message: `Failed to fetch ${url}: ${error}` }),
          });

          yield* Effect.annotateCurrentSpan(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);

          if (!response.ok) {
            return yield* new NetworkError({ message: `HTTP ${response.status}: ${response.statusText}` });
          }

          const content = yield* Effect.tryPromise({
            try: () => response.text(),
            catch: (error) => new NetworkError({ message: `Failed to read response body: ${error}` }),
          });

          yield* fileSystem.writeFile(destinationPath, content).pipe(
            Effect.mapError((error) => {
              switch (error._tag) {
                case "FileSystemError":
                  return new NetworkError({ message: `Failed to write file: ${error.message}` });
                case "UnknownError":
                  return new NetworkError({ message: `Failed to write file: ${error.message}` });
                default:
                  return new NetworkError({ message: `Failed to write file: ${error}` });
              }
            }),
          );
        }).pipe(
          annotateErrorTypeOnFailure,
          Effect.withSpan("http.download_file", {
            attributes: {
              ...createHttpClientSpanAttributes(url, HTTP_REQUEST_METHOD_VALUE_GET),
              [ATTR_FILE_PATH]: destinationPath,
            },
          }),
        ),
      checkConnectivity: (url: string): Effect.Effect<boolean> =>
        Effect.gen(function* () {
          const response = yield* Effect.tryPromise({
            try: () =>
              fetch(url, {
                method: HTTP_REQUEST_METHOD_VALUE_HEAD,
              }),
            catch: (error) => new NetworkError({ message: `Failed to check connectivity for ${url}: ${error}` }),
          });
          yield* Effect.annotateCurrentSpan(ATTR_HTTP_RESPONSE_STATUS_CODE, response.status);
          return response.ok;
        }).pipe(
          Effect.orElseSucceed(() => false),
          Effect.withSpan("http.check_connectivity", {
            attributes: createHttpClientSpanAttributes(url, HTTP_REQUEST_METHOD_VALUE_HEAD),
          }),
        ),
    } satisfies NetworkService;
  }),
);
