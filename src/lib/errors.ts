import { ExitCode } from "./exit-code";

export interface ErrorContext {
  command?: string;
  cwd?: string;
  version?: string;
  sessionId?: string;
  extra?: Record<string, unknown>; // ad-hoc data
}

export abstract class CLIError extends Error {
  abstract readonly exitCode: ExitCode;
  readonly timestamp = new Date().toISOString();

  constructor(
    message: string,
    public readonly context: ErrorContext = {},
    opts?: ErrorOptions,
  ) {
    super(message, opts);
    this.name = new.target.name;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      exitCode: this.exitCode,
      context: this.context,
      timestamp: this.timestamp,
    } as const;
  }
}

// Four concrete classes – add more *only* when handling logic differs.
export class UserInputError extends CLIError {
  readonly exitCode = ExitCode.BadInput;
}

export class ExternalToolError extends CLIError {
  readonly exitCode = ExitCode.ExternalTool;
}

export class FileSystemError extends CLIError {
  readonly exitCode = ExitCode.FileSystem;
}

export class ConfigurationError extends CLIError {
  readonly exitCode = ExitCode.Config;
}

// Recoverable wrapper
export abstract class RecoverableError extends CLIError {
  abstract recover(): Promise<void> | void;
}

// Type guards
export const isCLIError = (e: unknown): e is CLIError => e instanceof CLIError;
export const isRecoverableError = (e: unknown): e is RecoverableError => e instanceof RecoverableError;
