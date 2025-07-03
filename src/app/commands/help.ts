import { Effect } from "effect";

import { type CliCommandSpec } from "../../domain/models";

export const helpCommand: CliCommandSpec = {
  name: "help",
  description: "Show help for commands",
  exec: () =>
    Effect.gen(function* () {
      yield* Effect.logInfo("dev - Modern developer CLI");
      yield* Effect.logInfo("");
      yield* Effect.logInfo("Usage: dev <command> [options]");
      yield* Effect.logInfo("");
      yield* Effect.logInfo("Available commands:");
      yield* Effect.logInfo("  up         Set up the development environment");
      yield* Effect.logInfo("  run        Run a script or command");
      yield* Effect.logInfo("  status     Show project status");
      yield* Effect.logInfo("  clone      Clone a repository");
      yield* Effect.logInfo("  cd         Change directory");
      yield* Effect.logInfo("  auth       Manage authentication credentials");
      yield* Effect.logInfo("  upgrade    Upgrade the dev CLI");
      yield* Effect.logInfo("  help       Show help for commands");
      yield* Effect.logInfo("");
      yield* Effect.logInfo("Run 'dev <command> --help' for more information on a command.");
    }),
};
