import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect } from "vitest";

import { ShellMock } from "~/capabilities/system/shell-mock";
import { ShellTag } from "~/capabilities/system/shell-port";
import { FZF_MIN_VERSION, FzfToolsTag } from "~/capabilities/tools/adapters/fzf-tools-live";

describe("fzf-tools-live", () => {
  const makeFzfTools = (shell: ShellMock) =>
    Effect.gen(function* () {
      return yield* FzfToolsTag;
    }).pipe(Effect.provide(Layer.provide(FzfToolsTag.DefaultWithoutDependencies, Layer.succeed(ShellTag, shell))));

  it.effect("parses fzf version from shell output", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("fzf", ["--version"], {
        exitCode: 0,
        stdout: "0.67.1 (darwin)\n",
        stderr: "",
      });

      const fzfTools = yield* makeFzfTools(shell);
      const version = yield* fzfTools.getCurrentVersion();

      expect(version).toBe("0.67.1");
    }),
  );

  it.effect("returns null when fzf version command fails", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecFailure("fzf", ["--version"]);

      const fzfTools = yield* makeFzfTools(shell);
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

      const fzfTools = yield* makeFzfTools(shell);
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

      const fzfTools = yield* makeFzfTools(shell);
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

      const fzfTools = yield* makeFzfTools(shell);
      const result = yield* fzfTools.performHealthCheck();

      expect(result.toolName).toBe("fzf");
      expect(result.status).toBe("warning");
      expect(result.notes).toContain(`requires >=${FZF_MIN_VERSION}`);
    }),
  );
});
