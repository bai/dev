import { Command } from "commander";
import { Effect, Layer, Runtime } from "effect";

import { LoggerService, type CliCommandSpec, type CommandContext } from "../../domain/models";
import { FileSystemService } from "../../domain/ports/FileSystem";
import { ShellService } from "../../domain/ports/Shell";
// Import specific services and their implementations
import { LoggerLiveLayer } from "../../effect/LoggerLive";
import { FileSystemLiveLayer } from "../../infra/fs/FileSystemLive";
import { ShellLiveLayer } from "../../infra/shell/ShellLive";
import type { CliAdapter } from "./types";

export class CommanderAdapter implements CliAdapter {
  private program: Command;
  private commands: CliCommandSpec[];
  private runtime: Runtime.Runtime<never>;

  constructor(commands: CliCommandSpec[]) {
    this.program = new Command();
    this.commands = commands;
    this.program.exitOverride(); // Convert Commander failures into typed errors

    // Create runtime with app layers
    this.runtime = Runtime.defaultRuntime;
  }

  setMetadata(metadata: { name: string; description: string; version: string }): void {
    this.program.name(metadata.name).description(metadata.description).version(metadata.version);
  }

  initialize(commands: CliCommandSpec[]): void {
    for (const commandSpec of commands) {
      this.registerCommand(commandSpec);
    }
  }

  async parseAndExecute(args: string[]): Promise<void> {
    // Initialize with available commands
    this.initialize(this.commands);
    await this.program.parseAsync(args);
  }

  private registerCommand(commandSpec: CliCommandSpec): void {
    const cmd = this.program.command(commandSpec.name);

    cmd.description(commandSpec.description);

    // Add aliases
    if (commandSpec.aliases) {
      for (const alias of commandSpec.aliases) {
        cmd.alias(alias);
      }
    }

    // Add arguments
    if (commandSpec.arguments) {
      for (const arg of commandSpec.arguments) {
        if (arg.required) {
          cmd.argument(`<${arg.name}>`, arg.description, arg.defaultValue);
        } else {
          cmd.argument(`[${arg.name}]`, arg.description, arg.defaultValue);
        }
      }
    }

    // Add options
    if (commandSpec.options) {
      for (const option of commandSpec.options) {
        if (option.parser) {
          cmd.option(option.flags, option.description, option.parser, option.defaultValue);
        } else {
          cmd.option(option.flags, option.description, option.defaultValue);
        }
      }
    }

    // Set action handler
    cmd.action(async (...args) => {
      const commandArgs = args.slice(0, -1); // Remove the Command object
      const commanderCommand = args[args.length - 1] as Command;

      // Parse arguments outside the Effect.gen to avoid 'this' binding issues
      const parsedArgs = this.parseArguments(commandSpec, commandArgs);

      // Create minimal layer with essential services
      const MinimalAppLayer = Layer.mergeAll(LoggerLiveLayer, FileSystemLiveLayer, ShellLiveLayer);

      // Create an Effect that provides services and runs the command
      const program = Effect.gen(function* () {
        // Get services from the Effect Context
        const logger = yield* LoggerService;
        const fileSystem = yield* FileSystemService;
        const shell = yield* ShellService;

        // Create enhanced context with services
        const context = {
          args: parsedArgs,
          options: commanderCommand.opts(),
          logger,
          fileSystem,
          shell,
          baseDir: process.env.HOME + "/src", // Default base directory
        } as any; // Type assertion since we're extending CommandContext

        // Execute the command
        yield* commandSpec.exec(context);
      }).pipe(Effect.provide(MinimalAppLayer)) as Effect.Effect<void, never, never>;

      // Run with runtime
      const exit = await Runtime.runPromiseExit(this.runtime)(program);

      if (exit._tag === "Failure") {
        console.error("Command execution failed:", exit.cause);
        throw new Error("Command execution failed");
      }
    });
  }

  private parseArguments(commandSpec: CliCommandSpec, args: any[]): Record<string, any> {
    const parsed: Record<string, any> = {};

    if (commandSpec.arguments) {
      for (let i = 0; i < commandSpec.arguments.length; i++) {
        const argSpec = commandSpec.arguments[i];
        if (argSpec) {
          parsed[argSpec.name] = args[i];
        }
      }
    }

    return parsed;
  }
}
