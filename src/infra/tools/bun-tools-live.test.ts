import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { ShellMock } from "../shell-mock";
import { BUN_MIN_VERSION, makeBunToolsLive } from "./bun-tools-live";

describe("bun-tools-live", () => {
  it.effect("parses bun version from shell output", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("bun", ["--version"], {
        exitCode: 0,
        stdout: "1.4.2\n",
        stderr: "",
      });

      const bunTools = makeBunToolsLive(shell);
      const version = yield* bunTools.getCurrentVersion();

      expect(version).toBe("1.4.2");
    }),
  );

  it.effect("returns null when bun version command fails", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecFailure("bun", ["--version"]);

      const bunTools = makeBunToolsLive(shell);
      const version = yield* bunTools.getCurrentVersion();

      expect(version).toBeNull();
    }),
  );

  it.effect("performUpgrade returns true on successful bun upgrade", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("bun", ["upgrade"], {
        exitCode: 0,
        stdout: "updated",
        stderr: "",
      });

      const bunTools = makeBunToolsLive(shell);
      const upgraded = yield* bunTools.performUpgrade();

      expect(upgraded).toBe(true);
    }),
  );

  it.effect("performUpgrade returns false on failed bun upgrade", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("bun", ["upgrade"], {
        exitCode: 1,
        stdout: "",
        stderr: "failed",
      });

      const bunTools = makeBunToolsLive(shell);
      const upgraded = yield* bunTools.performUpgrade();

      expect(upgraded).toBe(false);
    }),
  );

  it.effect("health check reports warning for outdated bun versions", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("bun", ["--version"], {
        exitCode: 0,
        stdout: "1.0.0\n",
        stderr: "",
      });

      const bunTools = makeBunToolsLive(shell);
      const result = yield* bunTools.performHealthCheck();

      expect(result.toolName).toBe("bun");
      expect(result.status).toBe("warning");
      expect(result.notes).toContain(`requires >=${BUN_MIN_VERSION}`);
    }),
  );
});
