import { Effect, Layer } from "effect";

import { authError, type AuthError, type ShellExecutionError } from "../domain/errors";
import { KeychainTag, type Keychain } from "../domain/keychain-port";
import { ShellTag, type Shell } from "../domain/shell-port";

// Factory function to create Keychain implementation
export const makeKeychainLive = (shell: Shell): Keychain => ({
  setCredential: (
    service: string,
    account: string,
    password: string,
  ): Effect.Effect<void, AuthError | ShellExecutionError> =>
    shell
      .exec("security", [
        "add-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
        password,
        "-U", // Update if exists
      ])
      .pipe(
        Effect.flatMap((result) => {
          if (result.exitCode !== 0) {
            return authError(`Failed to store credential: ${result.stderr}`);
          }
          return Effect.void;
        }),
      ),

  getCredential: (service: string, account: string): Effect.Effect<string, AuthError | ShellExecutionError> =>
    shell
      .exec("security", [
        "find-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w", // Output password only
      ])
      .pipe(
        Effect.flatMap((result) => {
          if (result.exitCode !== 0) {
            return authError(`Credential not found for service '${service}' and account '${account}'`);
          }
          return Effect.succeed(result.stdout.trim());
        }),
      ),

  removeCredential: (service: string, account: string): Effect.Effect<void, AuthError | ShellExecutionError> =>
    shell.exec("security", ["delete-generic-password", "-s", service, "-a", account]).pipe(
      Effect.flatMap((result) => {
        if (result.exitCode !== 0) {
          return authError(`Failed to remove credential: ${result.stderr}`);
        }
        return Effect.void;
      }),
    ),

  hasCredential: (service: string, account: string): Effect.Effect<boolean> =>
    shell.exec("security", ["find-generic-password", "-s", service, "-a", account]).pipe(
      Effect.map((result) => result.exitCode === 0),
      Effect.orElseSucceed(() => false),
    ),
});

// Effect Layer for dependency injection
export const KeychainLiveLayer = Layer.effect(
  KeychainTag,
  Effect.gen(function* () {
    const shell = yield* ShellTag;
    return makeKeychainLive(shell);
  }),
);
