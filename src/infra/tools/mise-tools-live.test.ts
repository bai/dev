import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect, vi } from "vitest";

import type { Mise } from "../../domain/mise-port";
import type { Shell, SpawnResult } from "../../domain/shell-port";
import { makeMiseToolsLive } from "./mise-tools-live";

class MockShell implements Shell {
  exec(
    _command: string,
    args: string[] = [],
    _options?: {
      readonly cwd?: string;
    },
  ): Effect.Effect<SpawnResult, never> {
    if (args[0] === "version" && args[1] === "--json") {
      return Effect.succeed({
        exitCode: 0,
        stdout: JSON.stringify({ version: "2026.2.0", latest: "2026.2.0" }),
        stderr: "",
      });
    }
    return Effect.succeed({ exitCode: 0, stdout: "", stderr: "" });
  }

  execInteractive(
    _command: string,
    _args: string[] = [],
    _options?: {
      readonly cwd?: string;
    },
  ): Effect.Effect<number, never> {
    return Effect.succeed(0);
  }

  setProcessCwd(_path: string): Effect.Effect<void> {
    return Effect.void;
  }
}

const mockMise: Mise = {
  checkInstallation: () => Effect.succeed({ version: "2026.2.0", runtimeVersions: {} }),
  install: () => Effect.void,
  installTools: () => Effect.void,
  runTask: () => Effect.void,
  getTasks: () => Effect.succeed([]),
  setupGlobalConfig: vi.fn(() => Effect.void),
};

const makeSubject = () => {
  const shell = new MockShell();
  const miseTools = makeMiseToolsLive(shell, mockMise);
  return { shell, miseTools };
};

describe("mise-tools-live", () => {
  it.effect("ensureVersionOrUpgrade delegates setupGlobalConfig to Mise port", () =>
    Effect.gen(function* () {
      const { miseTools } = makeSubject();

      yield* miseTools.ensureVersionOrUpgrade();

      expect(mockMise.setupGlobalConfig).toHaveBeenCalled();
    }),
  );
});
