import { Effect, Layer } from "effect";

import { AutoUpgradeTrigger, type AutoUpgradeTriggerService } from "~/capabilities/system/auto-upgrade-trigger-port";
import { UnknownError } from "~/core/errors";

export const resolveAutoUpgradeInvocation = (argv: readonly string[], execPath: string): readonly [string, ...string[]] | null => {
  const scriptPath = argv[1];

  if (!execPath) {
    return null;
  }

  if (!scriptPath) {
    return null;
  }

  if (scriptPath === execPath || scriptPath.startsWith("/$bunfs/")) {
    return [execPath, "upgrade"];
  }

  return [execPath, scriptPath, "upgrade"];
};

const trigger = (): Effect.Effect<void, UnknownError> =>
  Effect.gen(function* () {
    const invocation = resolveAutoUpgradeInvocation(process.argv, process.execPath);

    if (!invocation) {
      return yield* new UnknownError({
        message: "Cannot determine CLI command invocation for auto-upgrade",
        details: "Cannot determine CLI command invocation for auto-upgrade",
      });
    }

    yield* Effect.try({
      try: () => {
        const processHandle = Bun.spawn([...invocation], {
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
      catch: (error) =>
        new UnknownError({
          message: `Failed to start auto-upgrade in background: ${error}`,
          details: `Failed to start auto-upgrade in background: ${error}`,
        }),
    });
  });

export const AutoUpgradeTriggerLive: AutoUpgradeTriggerService = {
  trigger,
};

export const AutoUpgradeTriggerLiveLayer = Layer.succeed(AutoUpgradeTrigger, AutoUpgradeTriggerLive);
