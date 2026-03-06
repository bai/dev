import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { type FileSystem, FileSystemTag } from "../domain/file-system-port";
import { MiseTag } from "../domain/mise-port";
import { MiseMock } from "../infra/mise-mock";
import { upCommand } from "./up-command";

const makeFileSystem = (cwd: string): FileSystem => ({
  readFile: () => Effect.succeed(""),
  writeFile: () => Effect.void,
  exists: () => Effect.succeed(false),
  mkdir: () => Effect.void,
  findDirectoriesGlob: () => Effect.succeed([]),
  getCwd: () => Effect.succeed(cwd),
});

describe("up-command", () => {
  it.effect("installs mise when missing, then installs tools", () =>
    Effect.gen(function* () {
      const mise = new MiseMock({
        installed: false,
        info: {
          version: "2026.1.5",
          runtimeVersions: {},
        },
      });
      const testLayer = Layer.mergeAll(Layer.succeed(MiseTag, mise), Layer.succeed(FileSystemTag, makeFileSystem("/tmp/project")));

      yield* upCommand.handler({}).pipe(Effect.provide(testLayer));

      expect(mise.installCalls).toBe(1);
      expect(mise.installToolsCalls).toEqual(["/tmp/project"]);
    }),
  );

  it.effect("skips mise install when already present", () =>
    Effect.gen(function* () {
      const mise = new MiseMock({
        installed: true,
        info: {
          version: "2026.1.5",
          runtimeVersions: {},
        },
      });
      const testLayer = Layer.mergeAll(Layer.succeed(MiseTag, mise), Layer.succeed(FileSystemTag, makeFileSystem("/tmp/project")));

      yield* upCommand.handler({}).pipe(Effect.provide(testLayer));

      expect(mise.installCalls).toBe(0);
      expect(mise.installToolsCalls).toEqual(["/tmp/project"]);
    }),
  );
});
