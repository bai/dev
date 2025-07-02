import { Effect, Layer } from "effect";

import { authError, unknownError, type AuthError, type UnknownError } from "../../domain/errors";
import { KeychainService, type Keychain } from "../../domain/ports/Keychain";
import { ShellService, type Shell } from "../../domain/ports/Shell";

export class KeychainLive implements Keychain {
  constructor(private shell: Shell) {}

  setCredential(service: string, account: string, password: string): Effect.Effect<void, AuthError | UnknownError> {
    return this.shell
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
            return Effect.fail(authError(`Failed to store credential: ${result.stderr}`));
          }
          return Effect.void;
        }),
      );
  }

  getCredential(service: string, account: string): Effect.Effect<string, AuthError | UnknownError> {
    return this.shell
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
            return Effect.fail(authError(`Credential not found for service '${service}' and account '${account}'`));
          }
          return Effect.succeed(result.stdout.trim());
        }),
      );
  }

  removeCredential(service: string, account: string): Effect.Effect<void, AuthError | UnknownError> {
    return this.shell
      .exec("security", [
        "delete-generic-password",
        "-s",
        service,
        "-a",
        account,
      ])
      .pipe(
        Effect.flatMap((result) => {
          if (result.exitCode !== 0) {
            return Effect.fail(authError(`Failed to remove credential: ${result.stderr}`));
          }
          return Effect.void;
        }),
      );
  }

  hasCredential(service: string, account: string): Effect.Effect<boolean> {
    return this.shell
      .exec("security", [
        "find-generic-password",
        "-s",
        service,
        "-a",
        account,
      ])
      .pipe(
        Effect.map((result) => result.exitCode === 0),
        Effect.catchAll(() => Effect.succeed(false)),
      );
  }
}

// Effect Layer for dependency injection
export const KeychainLiveLayer = Layer.effect(
  KeychainService,
  Effect.gen(function* () {
    const shell = yield* ShellService;
    return new KeychainLive(shell);
  }),
);
