import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { shellExecutionError } from "../domain/errors";
import { type FileSystem, FileSystemTag } from "../domain/file-system-port";
import { type Mise, MiseTag } from "../domain/mise-port";
import { upCommand } from "./up-command";

class MockMise implements Mise {
  public installCalls = 0;
  public installToolsCalls: Array<string | undefined> = [];

  constructor(private readonly installed: boolean) {}

  checkInstallation() {
    if (this.installed) {
      return Effect.succeed({
        version: "2026.1.5",
        runtimeVersions: {},
      });
    }

    return Effect.fail(shellExecutionError("mise", ["--version"], "not installed"));
  }

  install() {
    return Effect.sync(() => {
      this.installCalls += 1;
    });
  }

  installTools(cwd?: string) {
    return Effect.sync(() => {
      this.installToolsCalls.push(cwd);
    });
  }

  runTask() {
    return Effect.void;
  }

  getTasks() {
    return Effect.succeed([]);
  }

  setupGlobalConfig() {
    return Effect.void;
  }
}

const makeFileSystem = (cwd: string): FileSystem => ({
  readFile: () => Effect.succeed(""),
  writeFile: () => Effect.void,
  exists: () => Effect.succeed(false),
  mkdir: () => Effect.void,
  findDirectoriesGlob: () => Effect.succeed([]),
  getCwd: () => Effect.succeed(cwd),
  resolvePath: (path) => path,
});

describe("up-command", () => {
  it.effect("installs mise when missing, then installs tools", () =>
    Effect.gen(function* () {
      const mise = new MockMise(false);
      const testLayer = Layer.mergeAll(Layer.succeed(MiseTag, mise), Layer.succeed(FileSystemTag, makeFileSystem("/tmp/project")));

      yield* upCommand.handler({}).pipe(Effect.provide(testLayer));

      expect(mise.installCalls).toBe(1);
      expect(mise.installToolsCalls).toEqual(["/tmp/project"]);
    }),
  );

  it.effect("skips mise install when already present", () =>
    Effect.gen(function* () {
      const mise = new MockMise(true);
      const testLayer = Layer.mergeAll(Layer.succeed(MiseTag, mise), Layer.succeed(FileSystemTag, makeFileSystem("/tmp/project")));

      yield* upCommand.handler({}).pipe(Effect.provide(testLayer));

      expect(mise.installCalls).toBe(0);
      expect(mise.installToolsCalls).toEqual(["/tmp/project"]);
    }),
  );
});
