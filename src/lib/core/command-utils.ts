import { spawnSync } from "bun";

import {
  createCommandError,
  type CommandArgument,
  type CommandContext,
  type CommandOption,
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
 * Validate that context has required arguments
 */
export function validateArgs(context: CommandContext, requiredArgs: string[]): void {
  for (const argName of requiredArgs) {
    if (context.args[argName] === undefined || context.args[argName] === null) {
      throw createCommandError(`Missing required argument: ${argName}`, "validation");
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
    throw createCommandError(
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
    throw createCommandError(`Required tool '${toolName}' is not installed or not in PATH`, "tool-validation");
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
