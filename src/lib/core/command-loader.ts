import { Option, type Command } from "commander";

import type { CommandRegistry } from "~/lib/core/command-registry";
import {
  CommandError,
  type CommandArgument,
  type CommandContext,
  type ConfigManager,
  type DevCommand,
  type Logger,
} from "~/lib/core/command-types";
import { isDebugMode } from "~/lib/is-debug-mode";

/**
 * Command loader that converts DevCommand to commander.js commands
 */
export class CommandLoader {
  constructor(
    private registry: CommandRegistry,
    private logger: Logger,
    private config: ConfigManager,
  ) {}

  /**
   * Load a command into the commander program
   */
  loadCommand(devCommand: DevCommand, program: Command): void {
    const command = program.command(devCommand.name).description(devCommand.description);

    // Add aliases
    if (devCommand.aliases) {
      devCommand.aliases.forEach((alias) => command.alias(alias));
    }

    // Add help text
    if (devCommand.help) {
      command.addHelpText("after", `\n${devCommand.help}`);
    }

    // Add arguments
    if (devCommand.arguments) {
      devCommand.arguments.forEach((arg) => {
        const argSyntax = this.buildArgumentSyntax(arg);
        command.argument(argSyntax, arg.description, arg.defaultValue);
      });
    }

    // Add options
    if (devCommand.options) {
      devCommand.options.forEach((opt) => {
        const option = new Option(opt.flags, opt.description);

        if (opt.defaultValue !== undefined) {
          option.default(opt.defaultValue);
        }

        if (opt.choices) {
          option.choices(opt.choices);
        }

        if (opt.required) {
          option.makeOptionMandatory();
        }

        if (opt.parser) {
          option.argParser(opt.parser);
        }

        command.addOption(option);
      });
    }

    // Set up the action
    command.action(async (...args) => {
      const context = this.buildContext(devCommand, args, command);

      try {
        // Run validation if provided
        if (devCommand.validate) {
          const isValid = await devCommand.validate(context);
          if (!isValid) {
            process.exit(1);
          }
        }

        // Execute the command
        await devCommand.exec(context);
      } catch (error) {
        this.handleCommandError(error, devCommand.name);
      }
    });

    // Run custom setup if provided
    if (devCommand.setup) {
      devCommand.setup(command);
    }
  }

  /**
   * Load all registered commands
   */
  loadAllCommands(program: Command): void {
    this.registry.getAll().forEach((command) => {
      this.loadCommand(command, program);
    });
  }

  /**
   * Build argument syntax for commander.js
   */
  private buildArgumentSyntax(arg: CommandArgument): string {
    let syntax = arg.name;

    if (arg.variadic) {
      syntax += "...";
    }

    if (!arg.required) {
      syntax = `[${syntax}]`;
    } else {
      syntax = `<${syntax}>`;
    }

    return syntax;
  }

  /**
   * Build context object for command execution
   */
  private buildContext(devCommand: DevCommand, args: any[], command: Command): CommandContext {
    // Extract commander command object (last argument from commander)
    const commanderCmd = args.pop() as Command;

    // Get the parsed option values using commander's opts() method
    // For tests, commanderCmd might be a mock object without opts(), so fall back to {}
    const options = commanderCmd && typeof commanderCmd.opts === "function" ? commanderCmd.opts() : commanderCmd || {};

    // Build args object from remaining arguments and command definition
    const argsObj: Record<string, any> = {};
    if (devCommand.arguments) {
      let argIndex = 0;

      devCommand.arguments.forEach((arg, definitionIndex) => {
        let value;

        if (arg.variadic) {
          // For variadic arguments, commander.js already collects them into an array
          value = args[argIndex];
          // If the value is not an array or is undefined, use default or empty array
          if (!Array.isArray(value)) {
            value = arg.defaultValue !== undefined ? arg.defaultValue : [];
          }
        } else {
          // For non-variadic arguments, get the value at the current index
          value = args[argIndex];

          // Handle default values for undefined arguments
          if (value === undefined && arg.defaultValue !== undefined) {
            value = arg.defaultValue;
          }
        }

        argsObj[arg.name] = value;
        argIndex++;
      });
    }

    return {
      args: argsObj,
      options,
      command,
      logger: this.logger,
      config: this.config,
      registry: this.registry,
    };
  }

  /**
   * Handle command execution errors
   */
  private handleCommandError(error: any, commandName: string): never {
    if (error instanceof CommandError) {
      this.logger.error(`Command '${commandName}' failed: ${error.message}`);
      if (error.cause) {
        this.logger.error(`Caused by: ${error.cause.message}`);
      }
      if (isDebugMode()) {
        this.logger.error(error.stack || "");
      }
      process.exit(error.exitCode);
    } else if (error instanceof Error) {
      this.logger.error(`Unexpected error in command '${commandName}': ${error.message}`);
      if (isDebugMode()) {
        this.logger.error(error.stack || "");
      }
      process.exit(1);
    } else {
      this.logger.error(`Unknown error in command '${commandName}':`, error);
      process.exit(1);
    }
  }
}
