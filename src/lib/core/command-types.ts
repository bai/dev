import type { Command } from "commander";

/**
 * Unified interface for all CLI commands
 */
export interface DevCommand {
  /** Unique command name (used in CLI) */
  name: string;

  /** Short description of what the command does */
  description: string;

  /** Detailed help text (optional) */
  help?: string;

  /** Command aliases (optional) */
  aliases?: string[];

  /** Command arguments definition */
  arguments?: CommandArgument[];

  /** Command options/flags definition */
  options?: CommandOption[];

  /** Main execution function */
  exec(context: CommandContext): Promise<void> | void;

  /** Optional setup function called before exec */
  setup?(command: Command): void;

  /** Optional validation function */
  validate?(context: CommandContext): boolean | Promise<boolean>;

  /** Whether this command should be hidden from help (optional) */
  hidden?: boolean;
}

/**
 * Argument definition for commands
 */
export interface CommandArgument {
  /** Argument name */
  name: string;

  /** Description of the argument */
  description: string;

  /** Whether the argument is required */
  required?: boolean;

  /** Whether the argument accepts multiple values */
  variadic?: boolean;

  /** Default value if not provided */
  defaultValue?: any;
}

/**
 * Option/flag definition for commands
 */
export interface CommandOption {
  /** Option flags (e.g., '-f, --force') */
  flags: string;

  /** Description of the option */
  description: string;

  /** Default value */
  defaultValue?: any;

  /** Choices for the option (if applicable) */
  choices?: string[];

  /** Whether the option is required */
  required?: boolean;

  /** Custom parser function */
  parser?: (value: string) => any;
}

/**
 * Context passed to command execution
 */
export interface CommandContext {
  /** Parsed command line arguments */
  args: Record<string, any>;

  /** Parsed command line options */
  options: Record<string, any>;

  /** Raw commander.js command instance */
  command: Command;

  /** Logger instance */
  logger: Logger;

  /** Configuration access */
  config: ConfigManager;

  /** Command registry (optional, for internal commands like help) */
  registry?: any;
}

/**
 * Logger interface
 */
export interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  success(message: string, ...args: any[]): void;
  /** Create a child logger with a prefix */
  child(prefix: string): Logger;
}

/**
 * Configuration manager interface
 */
export interface ConfigManager {
  get<T = any>(key: string, defaultValue?: T): T;
  set(key: string, value: any): void;
  has(key: string): boolean;
  getAll(): Record<string, any>;
}

/**
 * Command registration result
 */
export interface CommandRegistration {
  command: DevCommand;
  filePath?: string; // For auto-discovered commands
  source: "auto-discovered" | "manually-registered";
}

/**
 * Error thrown when command execution fails
 */
export class CommandError extends Error {
  constructor(
    message: string,
    public command: string,
    public exitCode = 1,
    public cause?: Error,
  ) {
    super(message);
    this.name = "CommandError";
  }
}
