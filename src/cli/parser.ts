import { Cause, Effect, Exit, Runtime } from "effect";
import yargs, { type Argv } from "yargs";
import { hideBin } from "yargs/helpers";

import { CommandTrackingServiceTag } from "../app/services/CommandTrackingService";
import { AppLiveLayer } from "../app/wiring";
import { exitCode, type DevError } from "../domain/errors";
import { LoggerService, type CliCommandSpec, type CommandContext } from "../domain/models";

export interface CliMetadata {
  name: string;
  description: string;
  version: string;
}

export class DevCli {
  private yargs: Argv;
  private commands: CliCommandSpec[];
  private runtime: Runtime.Runtime<never>;
  private metadata?: CliMetadata;

  constructor(commands: CliCommandSpec[]) {
    this.yargs = yargs();
    this.commands = commands;
    this.runtime = Runtime.defaultRuntime;

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
    }).pipe(Effect.provide(AppLiveLayer)) as Effect.Effect<void, DevError, never>;

    // Execute the program and return the promise
    return Runtime.runPromiseExit(this.runtime)(commandProgram).then((exit) => {
      Exit.match(exit, {
        onSuccess: () => {
          // Command completed successfully
          process.exitCode = 0;
        },
        onFailure: (cause) => {
          // Handle command failure
          const failureOrCause = Cause.failureOrCause(cause);
          if (failureOrCause._tag === "Left") {
            const error = failureOrCause.left;
            if (error && typeof error === "object" && "_tag" in error) {
              const devError = error as DevError;
              console.error(`❌ ${devError._tag}`);

              // Handle different error types and their properties
              switch (devError._tag) {
                case "ExternalToolError":
                  console.error(devError.message);
                  break;
                case "ConfigError":
                case "GitError":
                case "NetworkError":
                case "AuthError":
                case "FileSystemError":
                case "UserInputError":
                case "CLIError":
                  console.error(devError.reason);
                  break;
                case "UnknownError":
                  console.error(String(devError.reason));
                  break;
              }

              process.exitCode = exitCode(devError);
            } else {
              console.error(`❌ Error:`, error);
              process.exitCode = 1;
            }
          } else {
            console.error(`💥 Unexpected error:`, failureOrCause.right);
            process.exitCode = 1;
          }
        },
      });
    });
  }
}
