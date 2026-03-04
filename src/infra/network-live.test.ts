import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";
import { afterEach, describe, expect, vi } from "vitest";

import type { FileSystem } from "../domain/file-system-port";
import { fileSystemError } from "../domain/errors";
import { makeNetworkLive } from "./network-live";

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
    resolvePath: (path) => path,
  };

  return { fileSystem, writes };
};

describe("network-live", () => {
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

      const network = makeNetworkLive(createMockFileSystem().fileSystem);
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

      const network = makeNetworkLive(createMockFileSystem().fileSystem);
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
      const network = makeNetworkLive(mock.fileSystem);

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

      const network = makeNetworkLive(createMockFileSystem().fileSystem);
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
      const network = makeNetworkLive(mock.fileSystem);
      const result = yield* Effect.exit(network.downloadFile("https://example.com/file", "/tmp/out.txt"));

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value._tag).toBe("NetworkError");
          expect(String((failure.value as { readonly reason: string }).reason)).toContain("Failed to write file");
        }
      }
    }),
  );

  it.effect("checkConnectivity returns false when fetch fails", () =>
    Effect.gen(function* () {
      vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

      const network = makeNetworkLive(createMockFileSystem().fileSystem);
      const connected = yield* network.checkConnectivity("https://example.com/health");

      expect(connected).toBe(false);
    }),
  );
});
