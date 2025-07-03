import { BunRuntime } from "@effect/platform-bun";
import { Effect } from "effect";
import yargs, { type Argv } from "yargs";
import { hideBin } from "yargs/helpers";

import { CommandTrackingServiceTag } from "../app/services/CommandTrackingService";
import { exitCode, type DevError } from "../domain/errors";
import { LoggerService, type CliCommandSpec, type CommandContext } from "../domain/models";
import { AppLiveLayer } from "../wiring";

export interface CliMetadata {
  name: string;
  description: string;
  version: string;
}

export class DevCli {
  private yargs: Argv;
  private commands: CliCommandSpec[];
  private metadata?: CliMetadata;

  constructor(commands: CliCommandSpec[]) {
    this.yargs = yargs();
    this.commands = commands;

    // Configure yargs behavior
    this.yargs
      .strict()
      .demandCommand(1, "You need at least one command before moving on")
      .recommendCommands()
      .help("help")
      .alias("help", "h")
      .version(false) // We'll handle version manually
      .wrap(Math.min(120, this.yargs.terminalWidth()));
  }

  setMetadata(metadata: CliMetadata): void {
    this.metadata = metadata;
    this.yargs
      .scriptName(metadata.name)
      .usage(`${metadata.description}\n\nUsage: $0 <command> [options]`)
      .version(metadata.version);
  }

  initialize(): void {
    for (const commandSpec of this.commands) {
      this.registerCommand(commandSpec);
    }
  }

  async parseAndExecute(args: string[]): Promise<void> {
    // Initialize with available commands
    this.initialize();

    // Parse arguments and execute
    await this.yargs.parseAsync(args);
  }

  private registerCommand(commandSpec: CliCommandSpec): void {
    this.yargs.command(
      this.buildCommandString(commandSpec),
      commandSpec.description,
      (yargs) => this.buildCommandOptions(yargs, commandSpec),
      (argv) => this.executeCommand(commandSpec, argv),
    );

    // Add aliases if any
    if (commandSpec.aliases) {
      for (const alias of commandSpec.aliases) {
        this.yargs.command(
          this.buildAliasCommandString(alias, commandSpec),
          `Alias for ${commandSpec.name}`,
          (yargs) => this.buildCommandOptions(yargs, commandSpec),
          (argv) => this.executeCommand(commandSpec, argv),
        );
      }
    }
  }

  private buildCommandString(commandSpec: CliCommandSpec): string {
    let command = commandSpec.name;

    if (commandSpec.arguments) {
      for (const arg of commandSpec.arguments) {
        if (arg.required) {
          command += ` <${arg.name}>`;
        } else {
          command += ` [${arg.name}]`;
        }

        if (arg.variadic) {
          command = command.replace(`<${arg.name}>`, `<${arg.name}..>`);
          command = command.replace(`[${arg.name}]`, `[${arg.name}..]`);
        }
      }
    }

    return command;
  }

  private buildAliasCommandString(alias: string, commandSpec: CliCommandSpec): string {
    let command = alias;

    if (commandSpec.arguments) {
      for (const arg of commandSpec.arguments) {
        if (arg.required) {
          command += ` <${arg.name}>`;
        } else {
          command += ` [${arg.name}]`;
        }

        if (arg.variadic) {
          command = command.replace(`<${arg.name}>`, `<${arg.name}..>`);
          command = command.replace(`[${arg.name}]`, `[${arg.name}..]`);
        }
      }
    }

    return command;
  }

  private buildCommandOptions(yargs: Argv, commandSpec: CliCommandSpec): Argv {
    let builder = yargs;

    // Add arguments with their descriptions and defaults
    if (commandSpec.arguments) {
      for (const arg of commandSpec.arguments) {
        builder = builder.positional(arg.name, {
          describe: arg.description,
          type: "string",
          default: arg.defaultValue,
        });
      }
    }

    // Add options
    if (commandSpec.options) {
      for (const option of commandSpec.options) {
        const optionConfig: any = {
          describe: option.description,
          default: option.defaultValue,
          demandOption: option.required || false,
        };

        if (option.choices) {
          optionConfig.choices = option.choices;
        }

        // Parse flag format like "-v, --verbose" or "--debug"
        const flags = option.flags.split(",").map((f) => f.trim());
        const longFlag = flags.find((f) => f.startsWith("--"))?.replace("--", "");
        const shortFlag = flags.find((f) => f.startsWith("-") && !f.startsWith("--"))?.replace("-", "");

        if (longFlag) {
          if (shortFlag) {
            optionConfig.alias = shortFlag;
          }
          builder = builder.option(longFlag, optionConfig);
        }
      }
    }

    // Add help text if available
    if (commandSpec.help) {
      builder = builder.epilog(commandSpec.help);
    }

    return builder;
  }

  private executeCommand(commandSpec: CliCommandSpec, argv: any): Promise<void> {
    // Extract command arguments
    const args: Record<string, any> = {};
    if (commandSpec.arguments) {
      for (const arg of commandSpec.arguments) {
        args[arg.name] = argv[arg.name];
      }
    }

    // Extract options (excluding yargs internals)
    const options: Record<string, any> = {};
    const internalKeys = ["_", "$0", "help", "h", "version"];

    for (const [key, value] of Object.entries(argv)) {
      if (!internalKeys.includes(key) && !commandSpec.arguments?.some((arg) => arg.name === key)) {
        options[key] = value;
      }
    }

    // Create the command execution program with tracking
    const commandProgram: Effect.Effect<void, DevError, never> = Effect.gen(function* () {
      // Start command tracking
      const tracking = yield* CommandTrackingServiceTag;
      const logger = yield* LoggerService;

      const runId = yield* tracking.recordCommandRun();

      // Execute the actual command with proper error handling
      const result = yield* Effect.either(
        commandSpec.exec({
          args,
          options,
        }),
      );

      // Handle completion and exit code recording
      if (result._tag === "Left") {
        // Command failed
        const error = result.left;
        yield* tracking.completeCommandRun(runId, exitCode(error));
        yield* logger.error(`Command failed: ${error._tag}`);
        return yield* Effect.fail(error);
      } else {
        // Command succeeded
        yield* tracking.completeCommandRun(runId, 0);
        return result.right;
      }
    }).pipe(
      Effect.provide(AppLiveLayer),
      Effect.catchAll((error: DevError) => {
        // Handle errors and set appropriate exit codes
        return Effect.gen(function* () {
          yield* Effect.logError(`❌ ${error._tag}`);

          // Handle different error types and their properties
          switch (error._tag) {
            case "ExternalToolError":
              yield* Effect.logError(error.message);
              break;
            case "ConfigError":
            case "GitError":
            case "NetworkError":
            case "AuthError":
            case "FileSystemError":
            case "UserInputError":
            case "CLIError":
              yield* Effect.logError(error.reason);
              break;
            case "UnknownError":
              yield* Effect.logError(String(error.reason));
              break;
          }

          yield* Effect.sync(() => {
            process.exitCode = exitCode(error);
          });
        });
      }),
    ) as Effect.Effect<void, never, never>;

    // Use BunRuntime.runMain for proper resource cleanup and graceful shutdown
    // Return a Promise that resolves when the command completes
    return new Promise<void>((resolve) => {
      BunRuntime.runMain(commandProgram);
      // Since BunRuntime.runMain handles the process exit, we resolve immediately
      resolve();
    });
  }
}
