import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { type FileSystemService, FileSystem } from "~/capabilities/system/file-system-port";
import { MiseMock } from "~/capabilities/tools/mise-mock";
import { Mise } from "~/capabilities/tools/mise-port";
import { upCommand } from "~/features/up/up-command";

const makeFileSystem = (cwd: string): FileSystemService => ({
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
      const testLayer = Layer.mergeAll(Layer.succeed(Mise, mise), Layer.succeed(FileSystem, makeFileSystem("/tmp/project")));

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
      const testLayer = Layer.mergeAll(Layer.succeed(Mise, mise), Layer.succeed(FileSystem, makeFileSystem("/tmp/project")));

      yield* upCommand.handler({}).pipe(Effect.provide(testLayer));

      expect(mise.installCalls).toBe(0);
      expect(mise.installToolsCalls).toEqual(["/tmp/project"]);
    }),
  );
});
