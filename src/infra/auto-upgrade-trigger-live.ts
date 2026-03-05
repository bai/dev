import { Effect, Layer } from "effect";

import { AutoUpgradeTriggerTag, type AutoUpgradeTrigger } from "../domain/auto-upgrade-trigger-port";
import { unknownError, type UnknownError } from "../domain/errors";

const trigger = (): Effect.Effect<void, UnknownError> =>
  Effect.gen(function* () {
    const command = process.argv[0];
    const scriptPath = process.argv[1];

    if (!command || !scriptPath) {
      return yield* unknownError("Cannot determine CLI command invocation for auto-upgrade");
    }

    yield* Effect.try({
      try: () => {
        const processHandle = Bun.spawn([command, scriptPath, "upgrade"], {
          cwd: process.cwd(),
          stdin: "ignore",
          stdout: "ignore",
          stderr: "ignore",
          detached: true,
          env: {
            ...process.env,
            DEV_AUTO_UPGRADE: "1",
          },
        });

        processHandle.unref();
      },
      catch: (error) => unknownError(`Failed to start auto-upgrade in background: ${error}`),
    });
  });

export const makeAutoUpgradeTriggerLive = (): AutoUpgradeTrigger => ({
  trigger,
});

export const AutoUpgradeTriggerLiveLayer = Layer.effect(AutoUpgradeTriggerTag, Effect.succeed(makeAutoUpgradeTriggerLive()));
