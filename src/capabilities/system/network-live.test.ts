import { NodeSdk } from "@effect/opentelemetry";
import { it } from "@effect/vitest";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import {
  ATTR_ERROR_TYPE,
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
  ATTR_SERVER_ADDRESS,
  ATTR_SERVER_PORT,
  ATTR_URL_FULL,
  HTTP_REQUEST_METHOD_VALUE_GET,
  HTTP_REQUEST_METHOD_VALUE_HEAD,
} from "@opentelemetry/semantic-conventions";
import { ATTR_FILE_PATH } from "@opentelemetry/semantic-conventions/incubating";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { afterEach, describe, expect, vi } from "vitest";

import { FileSystemTag, type FileSystem } from "~/capabilities/system/file-system-port";
import { NetworkLiveLayer } from "~/capabilities/system/network-live";
import { NetworkTag } from "~/capabilities/system/network-port";
import { fileSystemError } from "~/core/errors";

const createMockFileSystem = (
  writeBehavior?: (path: string, content: string) => Effect.Effect<void, ReturnType<typeof fileSystemError>, never>,
) => {
  const writes: Array<{ path: string; content: string }> = [];

  const fileSystem: FileSystem = {
    readFile: () => Effect.succeed(""),
    writeFile: (path, content) => {
      writes.push({ path, content });
      return writeBehavior ? writeBehavior(path, content) : Effect.void;
    },
    exists: () => Effect.succeed(true),
    mkdir: () => Effect.void,
    findDirectoriesGlob: () => Effect.succeed([]),
    getCwd: () => Effect.succeed("/tmp"),
  };

  return { fileSystem, writes };
};

const createTelemetryLayer = (exporter: InMemorySpanExporter) =>
  NodeSdk.layer(() => ({
    spanProcessor: new SimpleSpanProcessor(exporter),
    resource: {
      serviceName: "test-network",
    },
  }));

describe("network-live", () => {
  const makeNetwork = (fileSystem: FileSystem) =>
    Effect.gen(function* () {
      return yield* NetworkTag;
    }).pipe(Effect.provide(Layer.provide(NetworkLiveLayer, Layer.succeed(FileSystemTag, fileSystem))));

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.effect("get returns HTTP response metadata and body", () =>
    Effect.gen(function* () {
      const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("payload", {
          status: 200,
          statusText: "OK",
          headers: {
            "x-test": "1",
          },
        }),
      );

      const network = yield* makeNetwork(createMockFileSystem().fileSystem);
      const response = yield* network.get("https://example.com/config.json", { headers: { Authorization: "Bearer abc" } });

      expect(response.status).toBe(200);
      expect(response.statusText).toBe("OK");
      expect(response.body).toBe("payload");
      expect(response.headers["x-test"]).toBe("1");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }),
  );

  it.effect("get returns NetworkError when fetch throws", () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

      const network = yield* makeNetwork(createMockFileSystem().fileSystem);
      const result = yield* Effect.exit(network.get("https://example.com/fail"));

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value._tag).toBe("NetworkError");
        }
      }
    }),
  );

  it.effect("downloadFile writes response content to destination", () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("download-body", {
          status: 200,
          statusText: "OK",
        }),
      );

      const mock = createMockFileSystem();
      const network = yield* makeNetwork(mock.fileSystem);

      yield* network.downloadFile("https://example.com/file.txt", "/tmp/file.txt");

      expect(mock.writes).toEqual([{ path: "/tmp/file.txt", content: "download-body" }]);
    }),
  );

  it.effect("downloadFile fails on non-OK responses", () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("not found", {
          status: 404,
          statusText: "Not Found",
        }),
      );

      const network = yield* makeNetwork(createMockFileSystem().fileSystem);
      const result = yield* Effect.exit(network.downloadFile("https://example.com/missing", "/tmp/out.txt"));

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value._tag).toBe("NetworkError");
        }
      }
    }),
  );

  it.effect("downloadFile maps file system write errors to NetworkError", () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response("body", {
          status: 200,
          statusText: "OK",
        }),
      );

      const mock = createMockFileSystem(() => Effect.fail(fileSystemError("disk full", "/tmp/out.txt")));
      const network = yield* makeNetwork(mock.fileSystem);
      const result = yield* Effect.exit(network.downloadFile("https://example.com/file", "/tmp/out.txt"));

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value._tag).toBe("NetworkError");
          expect(failure.value.message).toContain("Failed to write file");
        }
      }
    }),
  );

  it.effect("checkConnectivity returns false when fetch fails", () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

      const network = yield* makeNetwork(createMockFileSystem().fileSystem);
      const connected = yield* network.checkConnectivity("https://example.com/health");

      expect(connected).toBe(false);
    }),
  );

  it.effect("get emits HTTP semconv attributes", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = createTelemetryLayer(exporter);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("payload", {
        status: 200,
        statusText: "OK",
      }),
    );

    return Effect.gen(function* () {
      const network = yield* makeNetwork(createMockFileSystem().fileSystem);
      yield* network.get("https://example.com:8443/config.json");

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "http.get");
      expect(span).toBeDefined();
      expect(span?.attributes[ATTR_HTTP_REQUEST_METHOD]).toBe(HTTP_REQUEST_METHOD_VALUE_GET);
      expect(span?.attributes[ATTR_URL_FULL]).toBe("https://example.com:8443/config.json");
      expect(span?.attributes[ATTR_SERVER_ADDRESS]).toBe("example.com");
      expect(span?.attributes[ATTR_SERVER_PORT]).toBe(8443);
      expect(span?.attributes[ATTR_HTTP_RESPONSE_STATUS_CODE]).toBe(200);
      expect(span?.attributes[ATTR_ERROR_TYPE]).toBeUndefined();
    }).pipe(Effect.provide(telemetryLayer), Effect.scoped);
  });

  it.effect("get with invalid URL emits fallback HTTP attrs without server fields", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = createTelemetryLayer(exporter);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("invalid url"));

    return Effect.gen(function* () {
      const network = yield* makeNetwork(createMockFileSystem().fileSystem);
      yield* Effect.exit(network.get("not-a-url"));

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "http.get");
      expect(span).toBeDefined();
      expect(span?.attributes[ATTR_HTTP_REQUEST_METHOD]).toBe(HTTP_REQUEST_METHOD_VALUE_GET);
      expect(span?.attributes[ATTR_URL_FULL]).toBe("not-a-url");
      expect(span?.attributes[ATTR_SERVER_ADDRESS]).toBeUndefined();
      expect(span?.attributes[ATTR_SERVER_PORT]).toBeUndefined();
      expect(span?.attributes[ATTR_HTTP_RESPONSE_STATUS_CODE]).toBeUndefined();
      expect(span?.attributes[ATTR_ERROR_TYPE]).toBe("NetworkError");
    }).pipe(Effect.provide(telemetryLayer), Effect.scoped);
  });

  it.effect("downloadFile emits response status code semconv attribute on HTTP errors", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = createTelemetryLayer(exporter);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not found", {
        status: 404,
        statusText: "Not Found",
      }),
    );

    return Effect.gen(function* () {
      const network = yield* makeNetwork(createMockFileSystem().fileSystem);
      yield* Effect.exit(network.downloadFile("https://example.com:8443/missing", "/tmp/out.txt"));

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "http.download_file");
      expect(span).toBeDefined();
      expect(span?.attributes[ATTR_HTTP_REQUEST_METHOD]).toBe(HTTP_REQUEST_METHOD_VALUE_GET);
      expect(span?.attributes[ATTR_URL_FULL]).toBe("https://example.com:8443/missing");
      expect(span?.attributes[ATTR_SERVER_ADDRESS]).toBe("example.com");
      expect(span?.attributes[ATTR_SERVER_PORT]).toBe(8443);
      expect(span?.attributes[ATTR_HTTP_RESPONSE_STATUS_CODE]).toBe(404);
      expect(span?.attributes[ATTR_FILE_PATH]).toBe("/tmp/out.txt");
      expect(span?.attributes[ATTR_ERROR_TYPE]).toBe("NetworkError");
    }).pipe(Effect.provide(telemetryLayer), Effect.scoped);
  });

  it.effect("checkConnectivity emits HTTP semconv attributes for HEAD requests", () => {
    const exporter = new InMemorySpanExporter();
    const telemetryLayer = createTelemetryLayer(exporter);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", {
        status: 204,
        statusText: "No Content",
      }),
    );

    return Effect.gen(function* () {
      const network = yield* makeNetwork(createMockFileSystem().fileSystem);
      yield* network.checkConnectivity("https://example.com:8443/health");

      const span = exporter.getFinishedSpans().find((candidate) => candidate.name === "http.check_connectivity");
      expect(span).toBeDefined();
      expect(span?.attributes[ATTR_HTTP_REQUEST_METHOD]).toBe(HTTP_REQUEST_METHOD_VALUE_HEAD);
      expect(span?.attributes[ATTR_URL_FULL]).toBe("https://example.com:8443/health");
      expect(span?.attributes[ATTR_SERVER_ADDRESS]).toBe("example.com");
      expect(span?.attributes[ATTR_SERVER_PORT]).toBe(8443);
      expect(span?.attributes[ATTR_HTTP_RESPONSE_STATUS_CODE]).toBe(204);
    }).pipe(Effect.provide(telemetryLayer), Effect.scoped);
  });
});
