import { Effect, Layer } from "effect";

import { Keychain, type KeychainService } from "~/capabilities/system/keychain-port";
import { Shell, type ShellService } from "~/capabilities/system/shell-port";
import { AuthError, type ShellExecutionError } from "~/core/errors";

// Effect Layer for dependency injection
export const KeychainLiveLayer = Layer.effect(
  Keychain,
  Effect.gen(function* () {
    const shell = yield* Shell;
    return {
      setCredential: (service: string, account: string, password: string): Effect.Effect<void, AuthError | ShellExecutionError> =>
        shell.exec("security", ["add-generic-password", "-s", service, "-a", account, "-w", password, "-U"]).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new AuthError({ message: `Failed to store credential: ${result.stderr}` });
            }
            return Effect.void;
          }),
        ),
      getCredential: (service: string, account: string): Effect.Effect<string, AuthError | ShellExecutionError> =>
        shell.exec("security", ["find-generic-password", "-s", service, "-a", account, "-w"]).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new AuthError({ message: `Credential not found for service '${service}' and account '${account}'` });
            }
            return Effect.succeed(result.stdout.trim());
          }),
        ),
      removeCredential: (service: string, account: string): Effect.Effect<void, AuthError | ShellExecutionError> =>
        shell.exec("security", ["delete-generic-password", "-s", service, "-a", account]).pipe(
          Effect.flatMap((result) => {
            if (result.exitCode !== 0) {
              return new AuthError({ message: `Failed to remove credential: ${result.stderr}` });
            }
            return Effect.void;
          }),
        ),
      hasCredential: (service: string, account: string): Effect.Effect<boolean> =>
        shell.exec("security", ["find-generic-password", "-s", service, "-a", account]).pipe(
          Effect.map((result) => result.exitCode === 0),
          Effect.orElseSucceed(() => false),
        ),
    } satisfies KeychainService;
  }),
);
