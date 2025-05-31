import { spawnSync } from "bun";

import {
  CommandError,
  type CommandArgument,
  type CommandContext,
  type CommandOption,
  type DevCommand,
  type Logger,
} from "~/lib/core/command-types";

/**
 * Utility for creating command arguments
 */
export function arg(
  name: string,
  description: string,
  options?: {
    required?: boolean;
    variadic?: boolean;
    defaultValue?: any;
  },
): CommandArgument {
  return {
    name,
    description,
    required: options?.required ?? false,
    variadic: options?.variadic ?? false,
    defaultValue: options?.defaultValue,
  };
}

/**
 * Utility for creating command options
 */
export function option(
  flags: string,
  description: string,
  options?: {
    defaultValue?: any;
    choices?: string[];
    required?: boolean;
    parser?: (value: string) => any;
  },
): CommandOption {
  return {
    flags,
    description,
    defaultValue: options?.defaultValue,
    choices: options?.choices,
    required: options?.required,
    parser: options?.parser,
  };
}

/**
 * Utility for creating simple commands
 */
export function createCommand(config: {
  name: string;
  description: string;
  help?: string;
  arguments?: CommandArgument[];
  options?: CommandOption[];
  aliases?: string[];
  hidden?: boolean;
  exec: (context: CommandContext) => Promise<void> | void;
  setup?: (command: any) => void;
  validate?: (context: CommandContext) => boolean | Promise<boolean>;
}): DevCommand {
  return {
    name: config.name,
    description: config.description,
    help: config.help,
    arguments: config.arguments,
    options: config.options,
    aliases: config.aliases,
    hidden: config.hidden,
    exec: config.exec,
    setup: config.setup,
    validate: config.validate,
  };
}

/**
 * Validate that context has required arguments
 */
export function validateArgs(context: CommandContext, requiredArgs: string[]): void {
  const { args, logger } = context;

  for (const argName of requiredArgs) {
    if (args[argName] === undefined || args[argName] === null) {
      throw new CommandError(`Missing required argument: ${argName}`, "validation");
    }
  }
}

/**
 * Get argument value with optional default
 */
export function getArg<T = any>(context: CommandContext, name: string, defaultValue?: T): T {
  return context.args[name] ?? defaultValue;
}

/**
 * Check if option is set
 */
export function hasOption(context: CommandContext, name: string): boolean {
  return context.options[name] !== undefined;
}

/**
 * Get option value with optional default
 */
export function getOption<T = any>(context: CommandContext, name: string, defaultValue?: T): T {
  return context.options[name] ?? defaultValue;
}

/**
 * Utility for spawning commands with consistent error handling
 */
export function spawnCommand(
  command: string[],
  options?: {
    cwd?: string;
    inherit?: boolean; // Whether to inherit stdio
    silent?: boolean; // Whether to suppress output
  },
): { exitCode: number; stdout?: string; stderr?: string } {
  const proc = spawnSync(command, {
    cwd: options?.cwd,
    stdio: options?.silent
      ? ["ignore", "pipe", "pipe"]
      : options?.inherit
        ? ["ignore", "inherit", "inherit"]
        : ["ignore", "pipe", "pipe"],
  });

  return {
    exitCode: proc.exitCode || 0,
    stdout: proc.stdout?.toString(),
    stderr: proc.stderr?.toString(),
  };
}

/**
 * Utility for running commands and throwing errors on failure
 */
export function runCommand(
  command: string[],
  context: CommandContext,
  options?: {
    cwd?: string;
    inherit?: boolean;
    silent?: boolean;
  },
): { stdout?: string; stderr?: string } {
  const { logger } = context;

  if (!options?.silent) {
    logger.debug(`Running: ${command.join(" ")}`);
  }

  const result = spawnCommand(command, options);

  if (result.exitCode !== 0) {
    throw new CommandError(
      `Command failed: ${command.join(" ")} (exit code: ${result.exitCode})`,
      "command-execution",
      result.exitCode,
    );
  }

  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/**
 * Utility for validating that a tool exists
 */
export function validateTool(toolName: string, context: CommandContext): void {
  const result = spawnCommand(["which", toolName], { silent: true });

  if (result.exitCode !== 0) {
    throw new CommandError(`Required tool '${toolName}' is not installed or not in PATH`, "tool-validation");
  }
}

/**
 * Utility for checking if we're in a git repository
 */
export function isGitRepository(cwd?: string): boolean {
  const result = spawnCommand(["git", "rev-parse", "--git-dir"], {
    cwd,
    silent: true,
  });

  return result.exitCode === 0;
}

/**
 * Utility for getting git repository root
 */
export function getGitRoot(cwd?: string): string | undefined {
  const result = spawnCommand(["git", "rev-parse", "--show-toplevel"], {
    cwd,
    silent: true,
  });

  if (result.exitCode === 0 && result.stdout) {
    return result.stdout.trim();
  }

  return undefined;
}

/**
 * Utility for wrapping legacy handler functions
 */
export function wrapLegacyHandler(
  name: string,
  description: string,
  handler: (...args: any[]) => Promise<void> | void,
  config?: {
    help?: string;
    arguments?: CommandArgument[];
    options?: CommandOption[];
    aliases?: string[];
    hidden?: boolean;
  },
): DevCommand {
  return {
    name,
    description,
    help: config?.help,
    arguments: config?.arguments,
    options: config?.options,
    aliases: config?.aliases,
    hidden: config?.hidden,
    async exec(context: CommandContext): Promise<void> {
      // Try to match the original function signature
      const argValues = config?.arguments?.map((arg) => context.args[arg.name]) || [];

      if (handler.length === 0) {
        // No arguments expected
        await handler();
      } else if (handler.length === 1) {
        // Single argument (likely args array)
        await handler(argValues);
      } else {
        // Multiple arguments - try to match original pattern
        await handler(...argValues, context.options);
      }
    },
  };
}

/**
 * Utility for handling common validation patterns
 */
export function validateChoice<T extends string>(
  context: CommandContext,
  argOrOptionName: string,
  choices: T[],
  isOption = false,
): T {
  const value = isOption ? context.options[argOrOptionName] : context.args[argOrOptionName];

  if (!choices.includes(value)) {
    const type = isOption ? "option" : "argument";
    throw new CommandError(
      `Invalid ${type} '${argOrOptionName}': ${value}. Must be one of: ${choices.join(", ")}`,
      "validation",
    );
  }

  return value;
}

/**
 * Utility for parsing numeric values with validation
 */
export function parseNumber(
  context: CommandContext,
  argOrOptionName: string,
  options?: {
    min?: number;
    max?: number;
    integer?: boolean;
    isOption?: boolean;
  },
): number {
  const { logger } = context;
  const value = options?.isOption ? context.options[argOrOptionName] : context.args[argOrOptionName];

  const num = Number(value);

  if (isNaN(num)) {
    throw new CommandError(`Invalid number for ${argOrOptionName}: ${value}`, "validation");
  }

  if (options?.integer && !Number.isInteger(num)) {
    throw new CommandError(`${argOrOptionName} must be an integer, got: ${value}`, "validation");
  }

  if (options?.min !== undefined && num < options.min) {
    throw new CommandError(`${argOrOptionName} must be at least ${options.min}, got: ${num}`, "validation");
  }

  if (options?.max !== undefined && num > options.max) {
    throw new CommandError(`${argOrOptionName} must be at most ${options.max}, got: ${num}`, "validation");
  }

  return num;
}
