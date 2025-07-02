import { Command } from "commander";
import { Runtime, type Effect } from "effect";

import { availableCommands } from "../../app/wiring";
import type { CliCommandSpec, CommandContext } from "../../domain/models";
import type { CliAdapter } from "./types";

export class CommanderAdapter implements CliAdapter {
  private program: Command;
  private commands: CliCommandSpec[];

  constructor(commands: CliCommandSpec[]) {
    this.program = new Command();
    this.commands = commands;
    this.program.exitOverride(); // Convert Commander failures into typed errors
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

      // Create basic context for command execution
      const context: CommandContext = {
        args: this.parseArguments(commandSpec, commandArgs),
        options: commanderCommand.opts(),
      };

      // Run the Effect-based command using the Effect runtime
      const runtime = Runtime.defaultRuntime;
      const effect = commandSpec.exec(context) as Effect.Effect<void, never, never>;

      const exit = await Runtime.runPromiseExit(runtime)(effect);

      if (exit._tag === "Failure") {
        // Command failed - the error should have been handled by the command itself
        // since it returns Effect<void, never, any>
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
