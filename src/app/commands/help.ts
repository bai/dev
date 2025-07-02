import { Effect } from "effect";

import { LoggerService, type CliCommandSpec } from "../../domain/models";

export const helpCommand: CliCommandSpec = {
  name: "help",
  description: "Show help information",
  help: "Display help information for the dev CLI or specific commands",
  arguments: [
    {
      name: "command",
      description: "Show help for a specific command",
      required: false,
    },
  ],
  exec: ({ args }) =>
    Effect.gen(function* () {
      const logger = yield* LoggerService;
      const command = args.command as string | undefined;

      if (command) {
        yield* logger.info(`Help for command: ${command}`);
        yield* logger.info("Detailed help would be shown here for the specific command.");
      } else {
        yield* logger.info("🚀 dev CLI - Development Environment Manager");
        yield* logger.info("");
        yield* logger.info("Usage: dev <command> [options]");
        yield* logger.info("");
        yield* logger.info("Commands:");
        yield* logger.info("  cd [name]                 Navigate to a project directory");
        yield* logger.info("  clone <repo>              Clone a repository");
        yield* logger.info("  up                        Set up development environment");
        yield* logger.info("  run <task>                Run a development task");
        yield* logger.info("  auth [service]            Manage authentication credentials");
        yield* logger.info("  status                    Check system status (alias: doctor)");
        yield* logger.info("  upgrade                   Update the dev CLI");
        yield* logger.info("  help [command]            Show help information");
        yield* logger.info("");
        yield* logger.info("For more information on a specific command, use:");
        yield* logger.info("  dev help <command>");
      }
    }),
};
