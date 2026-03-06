import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { ShellMock } from "~/capabilities/system/shell-mock";
import { Shell } from "~/capabilities/system/shell-port";
import { MiseTools } from "~/capabilities/tools/adapters/mise-tools-live";
import { MiseMock } from "~/capabilities/tools/mise-mock";
import { Mise } from "~/capabilities/tools/mise-port";

const makeSubject = () => {
  const shell = new ShellMock();
  shell.setExecResponse("mise", ["version", "--json"], {
    exitCode: 0,
    stdout: JSON.stringify({ version: "2026.2.0", latest: "2026.2.0" }),
    stderr: "",
  });
  const mise = new MiseMock({
    info: {
      version: "2026.2.0",
      runtimeVersions: {},
    },
  });
  const miseTools = Effect.gen(function* () {
    return yield* MiseTools;
  }).pipe(
    Effect.provide(
      Layer.provide(MiseTools.DefaultWithoutDependencies, Layer.mergeAll(Layer.succeed(Shell, shell), Layer.succeed(Mise, mise))),
    ),
  );
  return { mise, miseTools };
};

describe("mise-tools-live", () => {
  it.effect("ensureVersionOrUpgrade delegates setupGlobalConfig to Mise port", () =>
    Effect.gen(function* () {
      const { mise, miseTools } = makeSubject();

      const tools = yield* miseTools;
      yield* tools.ensureVersionOrUpgrade();

      expect(mise.setupGlobalConfigCalls).toBe(1);
    }),
  );
});
