import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect } from "vitest";

import { ShellMock } from "../shell-mock";
import { GIT_MIN_VERSION, makeGitToolsLive } from "./git-tools-live";

describe("git-tools-live", () => {
  it.effect("parses git version from shell output", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("git", ["--version"], {
        exitCode: 0,
        stdout: "git version 2.60.1\n",
        stderr: "",
      });

      const gitTools = makeGitToolsLive(shell);
      const version = yield* gitTools.getCurrentVersion();

      expect(version).toBe("2.60.1");
    }),
  );

  it.effect("returns null when git version command fails", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecFailure("git", ["--version"]);

      const gitTools = makeGitToolsLive(shell);
      const version = yield* gitTools.getCurrentVersion();

      expect(version).toBeNull();
    }),
  );

  it.effect("upgrades git through mise and returns true on success", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("mise", ["install", "git@latest"], {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      });

      const gitTools = makeGitToolsLive(shell);
      const upgraded = yield* gitTools.performUpgrade();

      expect(upgraded).toBe(true);
      expect(shell.execCalls[0]?.command).toBe("mise");
      expect(shell.execCalls[0]?.args).toEqual(["install", "git@latest"]);
    }),
  );

  it.effect("upgrades git through mise and returns false on failure", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("mise", ["install", "git@latest"], {
        exitCode: 1,
        stdout: "",
        stderr: "failed",
      });

      const gitTools = makeGitToolsLive(shell);
      const upgraded = yield* gitTools.performUpgrade();

      expect(upgraded).toBe(false);
    }),
  );

  it.effect("health check reports warning for outdated git versions", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("git", ["--version"], {
        exitCode: 0,
        stdout: "git version 2.40.0\n",
        stderr: "",
      });

      const gitTools = makeGitToolsLive(shell);
      const result = yield* gitTools.performHealthCheck();

      expect(result.toolName).toBe("git");
      expect(result.status).toBe("warning");
      expect(result.notes).toContain(`requires >=${GIT_MIN_VERSION}`);
    }),
  );
});
