import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { MiseMock } from "../mise-mock";
import { ShellMock } from "../shell-mock";
import { makeMiseToolsLive } from "./mise-tools-live";

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
  const miseTools = makeMiseToolsLive(shell, mise);
  return { mise, miseTools };
};

describe("mise-tools-live", () => {
  it.effect("ensureVersionOrUpgrade delegates setupGlobalConfig to Mise port", () =>
    Effect.gen(function* () {
      const { mise, miseTools } = makeSubject();

      yield* miseTools.ensureVersionOrUpgrade();

      expect(mise.setupGlobalConfigCalls).toBe(1);
    }),
  );
});
