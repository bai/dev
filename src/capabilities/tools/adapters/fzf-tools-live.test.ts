import { it } from "@effect/vitest";
import { Effect, Layer, Logger } from "effect";
import { describe, expect } from "vitest";

import { ShellMock } from "~/capabilities/system/shell-mock";
import { Shell } from "~/capabilities/system/shell-port";
import { FZF_MIN_VERSION, FzfTools } from "~/capabilities/tools/adapters/fzf-tools-live";

describe("fzf-tools-live", () => {
  const makeFzfTools = (shell: ShellMock) =>
    Effect.gen(function* () {
      return yield* FzfTools;
    }).pipe(Effect.provide(Layer.provide(FzfTools.DefaultWithoutDependencies, Layer.succeed(Shell, shell))));

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
      shell.setExecResponse("which", ["fzf"], {
        exitCode: 0,
        stdout: "/Users/v/.local/share/mise/installs/fzf/0.67.1/fzf",
        stderr: "",
      });
      shell.setExecResponse("mise", ["install", "fzf@latest"], {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      });

      const fzfTools = yield* makeFzfTools(shell);
      const upgraded = yield* fzfTools.performUpgrade();

      expect(upgraded).toBe(true);
      expect(shell.execCalls[1]?.command).toBe("mise");
      expect(shell.execCalls[1]?.args).toEqual(["install", "fzf@latest"]);
    }),
  );

  it.effect("upgrades fzf through Homebrew when the active binary is brew-managed", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("which", ["fzf"], {
        exitCode: 0,
        stdout: "/opt/homebrew/bin/fzf",
        stderr: "",
      });
      shell.setExecResponse("brew", ["--prefix"], {
        exitCode: 0,
        stdout: "/opt/homebrew",
        stderr: "",
      });
      shell.setExecResponse("brew", ["upgrade", "fzf"], {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      });

      const fzfTools = yield* makeFzfTools(shell);
      const upgraded = yield* fzfTools.performUpgrade();

      expect(upgraded).toBe(true);
      expect(shell.execCalls[2]?.command).toBe("brew");
      expect(shell.execCalls[2]?.args).toEqual(["upgrade", "fzf"]);
    }),
  );

  it.effect("upgrades fzf through mise and returns false on failure", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("which", ["fzf"], {
        exitCode: 0,
        stdout: "/Users/v/.local/share/mise/installs/fzf/0.67.1/fzf",
        stderr: "",
      });
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

  it.effect("logs stderr when fzf upgrade via mise fails", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      const loggedMessages: string[] = [];
      const logger = Logger.make(({ message }) => {
        loggedMessages.push(String(message));
      });
      shell.setExecResponse("which", ["fzf"], {
        exitCode: 0,
        stdout: "/Users/v/.local/share/mise/installs/fzf/0.67.1/fzf",
        stderr: "",
      });
      shell.setExecResponse("mise", ["install", "fzf@latest"], {
        exitCode: 1,
        stdout: "",
        stderr: "simulated mise install failure",
      });

      const fzfTools = yield* makeFzfTools(shell);
      const upgraded = yield* fzfTools.performUpgrade().pipe(Effect.provide(Logger.replace(Logger.defaultLogger, logger)));

      expect(upgraded).toBe(false);
      expect(loggedMessages).toContain("❌ Fzf update failed with exit code: 1");
      expect(loggedMessages).toContain("   stderr: simulated mise install failure");
    }),
  );

  it.effect("reports a Homebrew manual hint when brew-managed fzf upgrade fails", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      const loggedMessages: string[] = [];
      const logger = Logger.make(({ message }) => {
        loggedMessages.push(String(message));
      });
      shell.setExecResponse("fzf", ["--version"], {
        exitCode: 0,
        stdout: "0.60.0\n",
        stderr: "",
      });
      shell.setExecResponse("which", ["fzf"], {
        exitCode: 0,
        stdout: "/opt/homebrew/bin/fzf",
        stderr: "",
      });
      shell.setExecResponse("brew", ["--prefix"], {
        exitCode: 0,
        stdout: "/opt/homebrew",
        stderr: "",
      });
      shell.setExecResponse("brew", ["upgrade", "fzf"], {
        exitCode: 1,
        stdout: "",
        stderr: "simulated brew failure",
      });

      const fzfTools = yield* makeFzfTools(shell);
      const result = yield* Effect.exit(
        fzfTools.ensureVersionOrUpgrade().pipe(Effect.provide(Logger.replace(Logger.defaultLogger, logger))),
      );

      expect(result._tag).toBe("Failure");
      expect(loggedMessages).toContain("💡 Try manually upgrading fzf via Homebrew: brew upgrade fzf");
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
