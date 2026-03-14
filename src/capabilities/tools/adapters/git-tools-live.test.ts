import { it } from "@effect/vitest";
import { Effect, Layer, Logger } from "effect";
import { describe, expect } from "vitest";

import { ShellMock } from "~/capabilities/system/shell-mock";
import { Shell } from "~/capabilities/system/shell-port";
import { GIT_MIN_VERSION, GitTools } from "~/capabilities/tools/adapters/git-tools-live";

describe("git-tools-live", () => {
  const makeGitTools = (shell: ShellMock) =>
    Effect.gen(function* () {
      return yield* GitTools;
    }).pipe(Effect.provide(Layer.provide(GitTools.DefaultWithoutDependencies, Layer.succeed(Shell, shell))));

  it.effect("parses git version from shell output", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("git", ["--version"], {
        exitCode: 0,
        stdout: "git version 2.60.1\n",
        stderr: "",
      });

      const gitTools = yield* makeGitTools(shell);
      const version = yield* gitTools.getCurrentVersion();

      expect(version).toBe("2.60.1");
    }),
  );

  it.effect("returns null when git version command fails", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecFailure("git", ["--version"]);

      const gitTools = yield* makeGitTools(shell);
      const version = yield* gitTools.getCurrentVersion();

      expect(version).toBeNull();
    }),
  );

  it.effect("upgrades git through mise and returns true on success", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("which", ["git"], {
        exitCode: 0,
        stdout: "/Users/v/.local/share/mise/installs/git/2.60.1/bin/git",
        stderr: "",
      });
      shell.setExecResponse("mise", ["install", "git@latest"], {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      });

      const gitTools = yield* makeGitTools(shell);
      const upgraded = yield* gitTools.performUpgrade();

      expect(upgraded).toBe(true);
      expect(shell.execCalls[1]?.command).toBe("mise");
      expect(shell.execCalls[1]?.args).toEqual(["install", "git@latest"]);
    }),
  );

  it.effect("upgrades git through Homebrew when the active binary is brew-managed", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("which", ["git"], {
        exitCode: 0,
        stdout: "/opt/homebrew/bin/git",
        stderr: "",
      });
      shell.setExecResponse("brew", ["--prefix"], {
        exitCode: 0,
        stdout: "/opt/homebrew",
        stderr: "",
      });
      shell.setExecResponse("brew", ["upgrade", "git"], {
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      });

      const gitTools = yield* makeGitTools(shell);
      const upgraded = yield* gitTools.performUpgrade();

      expect(upgraded).toBe(true);
      expect(shell.execCalls[2]?.command).toBe("brew");
      expect(shell.execCalls[2]?.args).toEqual(["upgrade", "git"]);
    }),
  );

  it.effect("upgrades git through mise and returns false on failure", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecResponse("which", ["git"], {
        exitCode: 0,
        stdout: "/Users/v/.local/share/mise/installs/git/2.60.1/bin/git",
        stderr: "",
      });
      shell.setExecResponse("mise", ["install", "git@latest"], {
        exitCode: 1,
        stdout: "",
        stderr: "failed",
      });

      const gitTools = yield* makeGitTools(shell);
      const upgraded = yield* gitTools.performUpgrade();

      expect(upgraded).toBe(false);
    }),
  );

  it.effect("logs stderr when git upgrade via mise fails", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      const loggedMessages: string[] = [];
      const logger = Logger.make(({ message }) => {
        loggedMessages.push(String(message));
      });
      shell.setExecResponse("which", ["git"], {
        exitCode: 0,
        stdout: "/Users/v/.local/share/mise/installs/git/2.60.1/bin/git",
        stderr: "",
      });
      shell.setExecResponse("mise", ["install", "git@latest"], {
        exitCode: 1,
        stdout: "",
        stderr: "simulated mise install failure",
      });

      const gitTools = yield* makeGitTools(shell);
      const upgraded = yield* gitTools.performUpgrade().pipe(Effect.provide(Logger.replace(Logger.defaultLogger, logger)));

      expect(upgraded).toBe(false);
      expect(loggedMessages).toContain("❌ Git update failed with exit code: 1");
      expect(loggedMessages).toContain("   stderr: simulated mise install failure");
    }),
  );

  it.effect("reports a Homebrew manual hint when brew-managed git upgrade fails", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      const loggedMessages: string[] = [];
      const logger = Logger.make(({ message }) => {
        loggedMessages.push(String(message));
      });
      shell.setExecResponse("git", ["--version"], {
        exitCode: 0,
        stdout: "git version 2.40.0\n",
        stderr: "",
      });
      shell.setExecResponse("which", ["git"], {
        exitCode: 0,
        stdout: "/opt/homebrew/bin/git",
        stderr: "",
      });
      shell.setExecResponse("brew", ["--prefix"], {
        exitCode: 0,
        stdout: "/opt/homebrew",
        stderr: "",
      });
      shell.setExecResponse("brew", ["upgrade", "git"], {
        exitCode: 1,
        stdout: "",
        stderr: "simulated brew failure",
      });

      const gitTools = yield* makeGitTools(shell);
      const result = yield* Effect.exit(
        gitTools.ensureVersionOrUpgrade().pipe(Effect.provide(Logger.replace(Logger.defaultLogger, logger))),
      );

      expect(result._tag).toBe("Failure");
      expect(loggedMessages).toContain("💡 Try manually upgrading git via Homebrew: brew upgrade git");
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

      const gitTools = yield* makeGitTools(shell);
      const result = yield* gitTools.performHealthCheck();

      expect(result.toolName).toBe("git");
      expect(result.status).toBe("warning");
      expect(result.notes).toContain(`requires >=${GIT_MIN_VERSION}`);
    }),
  );
});
