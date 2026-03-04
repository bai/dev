import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { ShellMock } from "../shell-mock";
import { FZF_MIN_VERSION, makeFzfToolsLive } from "./fzf-tools-live";

describe("fzf-tools-live", () => {
  it.effect("parses fzf version from shell output", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("fzf", ["--version"], {
        exitCode: 0,
        stdout: "0.67.1 (darwin)\n",
        stderr: "",
      });

      const fzfTools = makeFzfToolsLive(shell);
      const version = yield* fzfTools.getCurrentVersion();

      expect(version).toBe("0.67.1");
    }),
  );

  it.effect("returns null when fzf version command fails", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecFailure("fzf", ["--version"]);

      const fzfTools = makeFzfToolsLive(shell);
      const version = yield* fzfTools.getCurrentVersion();

      expect(version).toBeNull();
    }),
  );

  it.effect("upgrades fzf through mise and returns true on success", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("mise", ["install", "fzf@latest"], {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      });

      const fzfTools = makeFzfToolsLive(shell);
      const upgraded = yield* fzfTools.performUpgrade();

      expect(upgraded).toBe(true);
      expect(shell.execCalls[0]?.command).toBe("mise");
      expect(shell.execCalls[0]?.args).toEqual(["install", "fzf@latest"]);
    }),
  );

  it.effect("upgrades fzf through mise and returns false on failure", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("mise", ["install", "fzf@latest"], {
        exitCode: 1,
        stdout: "",
        stderr: "failed",
      });

      const fzfTools = makeFzfToolsLive(shell);
      const upgraded = yield* fzfTools.performUpgrade();

      expect(upgraded).toBe(false);
    }),
  );

  it.effect("health check reports warning for outdated fzf versions", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("fzf", ["--version"], {
        exitCode: 0,
        stdout: "0.35.0\n",
        stderr: "",
      });

      const fzfTools = makeFzfToolsLive(shell);
      const result = yield* fzfTools.performHealthCheck();

      expect(result.toolName).toBe("fzf");
      expect(result.status).toBe("warning");
      expect(result.notes).toContain(`requires >=${FZF_MIN_VERSION}`);
    }),
  );
});
