import { it } from "@effect/vitest";
import { Cause, Effect, Exit, Option } from "effect";
import { describe, expect } from "vitest";

import type { Shell, SpawnResult } from "../domain/shell-port";
import { makeKeychainLive } from "./keychain-live";

const createShell = (responses: Record<string, SpawnResult>): Shell => ({
  exec: (command, args = []) =>
    Effect.sync(() => {
      const key = [command, ...args].join(" ");
      return responses[key] ?? { exitCode: 1, stdout: "", stderr: "not mocked" };
    }),
  execInteractive: () => Effect.succeed(0),
  setProcessCwd: () => Effect.void,
});

describe("keychain-live", () => {
  it.effect("stores credentials when security command succeeds", () =>
    Effect.gen(function* () {
      const shell = createShell({
        "security add-generic-password -s dev -a me -w secret -U": {
          exitCode: 0,
          stdout: "",
          stderr: "",
        },
      });

      const keychain = makeKeychainLive(shell);
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

      const keychain = makeKeychainLive(shell);
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

      const keychain = makeKeychainLive(shell);
      const credential = yield* keychain.getCredential("dev", "me");

      expect(credential).toBe("secret-value");
    }),
  );

  it.effect("hasCredential returns false when shell execution fails", () =>
    Effect.gen(function* () {
      const shell: Shell = {
        exec: () => Effect.fail(new Error("shell crashed") as never),
        execInteractive: () => Effect.succeed(0),
        setProcessCwd: () => Effect.void,
      };

      const keychain = makeKeychainLive(shell);
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

      const keychain = makeKeychainLive(shell);
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
