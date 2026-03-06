import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { describe, expect } from "vitest";

import { KeychainLiveLayer } from "~/capabilities/system/keychain-live";
import { KeychainTag } from "~/capabilities/system/keychain-port";
import { ShellMock } from "~/capabilities/system/shell-mock";
import { ShellTag, type SpawnResult } from "~/capabilities/system/shell-port";

const createShell = (responses: Record<string, SpawnResult>) => {
  const shell = new ShellMock();

  for (const [key, response] of Object.entries(responses)) {
    const [command = "", ...args] = key.split(" ");
    shell.setExecResponse(command, args, response);
  }

  return shell;
};

describe("keychain-live", () => {
  const makeKeychain = (shell: ShellMock) =>
    Effect.gen(function* () {
      return yield* KeychainTag;
    }).pipe(Effect.provide(Layer.provide(KeychainLiveLayer, Layer.succeed(ShellTag, shell))));

  it.effect("stores credentials when security command succeeds", () =>
    Effect.gen(function* () {
      const shell = createShell({
        "security add-generic-password -s dev -a me -w secret -U": {
          exitCode: 0,
          stdout: "",
          stderr: "",
        },
      });

      const keychain = yield* makeKeychain(shell);
      const result = yield* Effect.exit(keychain.setCredential("dev", "me", "secret"));

      expect(Exit.isSuccess(result)).toBe(true);
    }),
  );

  it.effect("fails to store credentials when security command fails", () =>
    Effect.gen(function* () {
      const shell = createShell({
        "security add-generic-password -s dev -a me -w secret -U": {
          exitCode: 1,
          stdout: "",
          stderr: "permission denied",
        },
      });

      const keychain = yield* makeKeychain(shell);
      const result = yield* Effect.exit(keychain.setCredential("dev", "me", "secret"));

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value._tag).toBe("AuthError");
        }
      }
    }),
  );

  it.effect("retrieves credentials when available", () =>
    Effect.gen(function* () {
      const shell = createShell({
        "security find-generic-password -s dev -a me -w": {
          exitCode: 0,
          stdout: "secret-value \n",
          stderr: "",
        },
      });

      const keychain = yield* makeKeychain(shell);
      const credential = yield* keychain.getCredential("dev", "me");

      expect(credential).toBe("secret-value");
    }),
  );

  it.effect("hasCredential returns false when shell execution fails", () =>
    Effect.gen(function* () {
      const shell = new ShellMock();
      shell.setExecFailure("security", ["find-generic-password", "-s", "dev", "-a", "me"]);

      const keychain = yield* makeKeychain(shell);
      const hasCredential = yield* keychain.hasCredential("dev", "me");

      expect(hasCredential).toBe(false);
    }),
  );

  it.effect("removeCredential fails on non-zero exit code", () =>
    Effect.gen(function* () {
      const shell = createShell({
        "security delete-generic-password -s dev -a me": {
          exitCode: 1,
          stdout: "",
          stderr: "not found",
        },
      });

      const keychain = yield* makeKeychain(shell);
      const result = yield* Effect.exit(keychain.removeCredential("dev", "me"));

      expect(Exit.isFailure(result)).toBe(true);
      if (Exit.isFailure(result)) {
        const failure = Cause.failureOption(result.cause);
        expect(Option.isSome(failure)).toBe(true);
        if (Option.isSome(failure)) {
          expect(failure.value._tag).toBe("AuthError");
        }
      }
    }),
  );
});
