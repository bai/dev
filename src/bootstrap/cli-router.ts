import { Command } from "@effect/cli";
import { Effect } from "effect";
import * as Arr from "effect/Array";

import { type CommandRegistry, type CommandRegistryTag } from "~/bootstrap/command-registry-port";
import { registerCdCommand } from "~/features/cd/cd-command";
import { registerCloneCommand } from "~/features/clone/clone-command";
import { registerRunCommand } from "~/features/run/run-command";
import { registerServicesCommand } from "~/features/services/services-command";
import { registerStatusCommand } from "~/features/status/status-command";
import { registerSyncCommand } from "~/features/sync/sync-command";
import { registerUpCommand } from "~/features/up/up-command";
import { registerUpgradeCommand } from "~/features/upgrade/upgrade-command";

type CliCommand = Command.Command<string, unknown, unknown, unknown>;

export const displayMainHelp = (): Effect.Effect<void, never, never> =>
  Effect.gen(function* () {
    yield* Effect.logInfo("A CLI tool for quick navigation and environment management\n");

    yield* Effect.logInfo("USAGE");
    yield* Effect.logInfo("  dev <command> [options]\n");

    yield* Effect.logInfo("EXAMPLES");
    yield* Effect.logInfo("  dev cd myproject           # Navigate to a project directory");
    yield* Effect.logInfo("  dev clone user/repo        # Clone a repository");
    yield* Effect.logInfo("  dev up                     # Install and update development tools");
    yield* Effect.logInfo("  dev sync                   # Sync all repositories");
    yield* Effect.logInfo("  dev status                 # Check environment health");
    yield* Effect.logInfo("  dev run start              # Execute project tasks\n");

    yield* Effect.logInfo("COMMANDS");
    yield* Effect.logInfo("  cd           Navigate to directories using fuzzy search");
    yield* Effect.logInfo("  clone        Clone repositories from various providers");
    yield* Effect.logInfo("  up           Install and update development tools using mise");
    yield* Effect.logInfo("  run          Execute project tasks and scripts using mise");
    yield* Effect.logInfo("  services     Manage shared development services (PostgreSQL, Valkey)");
    yield* Effect.logInfo("  status       Check the health of your development environment");
    yield* Effect.logInfo("  sync         Update all repositories in your workspace");
    yield* Effect.logInfo("  upgrade      Upgrade the dev CLI tool and essential tools\n");

    yield* Effect.logInfo("Use 'dev <command> --help' for command-specific help.\n");
  });

export const registerAllCommands: Effect.Effect<void, never, CommandRegistryTag> = Effect.gen(function* () {
  yield* registerCdCommand;
  yield* registerCloneCommand;
  yield* registerUpCommand;
  yield* registerRunCommand;
  yield* registerServicesCommand;
  yield* registerStatusCommand;
  yield* registerSyncCommand;
  yield* registerUpgradeCommand;
});

export const checkAndDisplayHelp = (args: readonly string[], registry: CommandRegistry): Effect.Effect<boolean, never, never> =>
  Effect.gen(function* () {
    const hasHelp = args.includes("--help") || args.includes("-h");

    if (!hasHelp) {
      return false;
    }

    const firstArg = args[0];
    const commandName = firstArg && !firstArg.startsWith("-") ? firstArg : undefined;

    if (commandName) {
      const command = yield* registry.getByName(commandName);
      if (command) {
        yield* command.displayHelp();
      } else {
        yield* displayMainHelp();
      }
    } else {
      yield* displayMainHelp();
    }

    return true;
  });

export const createMainCommand = (registry: CommandRegistry) =>
  Effect.gen(function* () {
    const commands = (yield* registry.getCommands()) as ReadonlyArray<CliCommand>;
    const baseCommand = Command.make("dev", {}, () => Effect.logInfo("Use --help to see available commands"));

    if (!Arr.isNonEmptyReadonlyArray(commands)) {
      yield* Effect.logWarning("No commands registered; running without subcommands");
      return baseCommand;
    }

    return baseCommand.pipe(Command.withSubcommands(commands));
  });

export const runCli = (
  registry: CommandRegistry,
  metadata: {
    name: string;
    version: string;
    description?: string;
  },
): Effect.Effect<void, unknown, unknown> =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* Effect.logDebug("🔧 Cleaning up CLI resources...");
          yield* Effect.logDebug("✅ CLI cleanup complete");
        }),
      );

      yield* Effect.logDebug("🚀 Starting Effect CLI...");

      const args = process.argv.slice(2);
      const helpDisplayed = yield* checkAndDisplayHelp(args, registry);

      if (helpDisplayed) {
        return;
      }

      const mainCommand = yield* createMainCommand(registry);
      const cli = Command.run(mainCommand as Command.Command<string, unknown, unknown, unknown>, {
        name: metadata.name,
        version: metadata.version,
      });

      yield* cli(process.argv);
      yield* Effect.logDebug("✅ CLI execution completed successfully");
    }),
  );
