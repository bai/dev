import { Option, type Command } from "commander";

import {
  createCommandError,
  isCommandError,
  type CommandArgument,
  type CommandContext,
  type ConfigManager,
  type DevCommand,
  type Logger,
} from "~/lib/core/command-types";
import { isDebugMode } from "~/lib/is-debug-mode";

/**
 * Build argument syntax for commander.js
 */
const buildArgumentSyntax = (arg: CommandArgument): string => {
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
};

/**
 * Build context object for command execution
 */
const buildContext = (
  devCommand: DevCommand,
  args: any[],
  command: Command,
  logger: Logger,
  config: ConfigManager,
): CommandContext => {
  // Extract commander command object (last argument from commander)
  const commanderCmd = args.pop() as Command;

  // Get the parsed option values using commander's opts() method
  const options = commanderCmd && typeof commanderCmd.opts === "function" ? commanderCmd.opts() : commanderCmd || {};

  // Build args object from remaining arguments and command definition
  const argsObj: Record<string, any> = {};
  if (devCommand.arguments) {
    devCommand.arguments.forEach((arg, definitionIndex) => {
      let value;

      if (arg.variadic) {
        // For variadic arguments, commander.js already collects them into an array
        value = args[definitionIndex];
        // If the value is not an array or is undefined, use default or empty array
        if (!Array.isArray(value)) {
          value = arg.defaultValue !== undefined ? arg.defaultValue : [];
        }
      } else {
        // For non-variadic arguments, get the value at the current index
        value = args[definitionIndex];

        // Handle default values for undefined arguments
        if (value === undefined && arg.defaultValue !== undefined) {
          value = arg.defaultValue;
        }
      }

      argsObj[arg.name] = value;
    });
  }

  return {
    args: argsObj,
    options,
    command,
    logger,
    config,
  };
};

/**
 * Handle command execution errors
 */
const handleCommandError = (error: any, commandName: string, logger: Logger): never => {
  if (isCommandError(error)) {
    logger.error(`Command '${commandName}' failed: ${error.message}`);
    if (error.cause) {
      logger.error(`Caused by: ${error.cause.message}`);
    }
    if (isDebugMode()) {
      logger.error(error.stack || "");
    }
    process.exit(error.exitCode);
  } else if (error instanceof Error) {
    logger.error(`Unexpected error in command '${commandName}': ${error.message}`);
    if (isDebugMode()) {
      logger.error(error.stack || "");
    }
    process.exit(1);
  } else {
    logger.error(`Unknown error in command '${commandName}':`, error);
    process.exit(1);
  }
};

/**
 * Load a command into the commander program
 */
export const loadCommand = (devCommand: DevCommand, program: Command, logger: Logger, config: ConfigManager): void => {
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
      const argSyntax = buildArgumentSyntax(arg);
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
    const context = buildContext(devCommand, args, command, logger, config);

    try {
      // Execute the command
      await devCommand.exec(context);
    } catch (error) {
      handleCommandError(error, devCommand.name, logger);
    }
  });
};

/**
 * Load all commands from an array into the commander program
 */
export const loadAllCommands = (
  commands: DevCommand[],
  program: Command,
  logger: Logger,
  config: ConfigManager,
): void => {
  commands.forEach((command) => {
    loadCommand(command, program, logger, config);
  });
};

// Export individual functions for direct use
export { buildContext, buildArgumentSyntax, handleCommandError };
