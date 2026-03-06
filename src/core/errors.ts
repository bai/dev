import { Schema } from "effect";

import type { TracingError } from "~/core/observability/tracing-port";

// Re-export TracingError for convenience
export { TracingError } from "~/core/observability/tracing-port";

const defaultProgramExitCode = 1;

const formatUnknownDetails = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error && value.message.length > 0) {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", {
  message: Schema.String,
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class GitError extends Schema.TaggedError<GitError>()("GitError", {
  message: Schema.String,
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  message: Schema.String,
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  message: Schema.String,
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class UnknownError extends Schema.TaggedError<UnknownError>()("UnknownError", {
  message: Schema.String,
  details: Schema.optional(Schema.Unknown),
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class ExternalToolError extends Schema.TaggedError<ExternalToolError>()("ExternalToolError", {
  message: Schema.String,
  tool: Schema.optional(Schema.String),
  toolExitCode: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class FileSystemError extends Schema.TaggedError<FileSystemError>()("FileSystemError", {
  message: Schema.String,
  path: Schema.optional(Schema.String),
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class StatusCheckError extends Schema.TaggedError<StatusCheckError>()("StatusCheckError", {
  message: Schema.String,
  failedComponents: Schema.Array(Schema.String),
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class HealthCheckError extends Schema.TaggedError<HealthCheckError>()("HealthCheckError", {
  message: Schema.String,
  tool: Schema.optional(Schema.String),
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class ShellExecutionError extends Schema.TaggedError<ShellExecutionError>()("ShellExecutionError", {
  command: Schema.String,
  args: Schema.Array(Schema.String),
  message: Schema.String,
  cwd: Schema.optional(Schema.String),
  underlyingError: Schema.optional(Schema.Unknown),
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class DockerServiceError extends Schema.TaggedError<DockerServiceError>()("DockerServiceError", {
  message: Schema.String,
  service: Schema.optional(Schema.String),
  serviceExitCode: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

export class CliUsageError extends Schema.TaggedError<CliUsageError>()("CliUsageError", {
  message: Schema.String,
  validationTag: Schema.String,
}) {
  get exitCode(): number {
    return defaultProgramExitCode;
  }
}

// Union type for all domain errors
export type DevError =
  | ConfigError
  | GitError
  | NetworkError
  | AuthError
  | ExternalToolError
  | FileSystemError
  | StatusCheckError
  | HealthCheckError
  | ShellExecutionError
  | DockerServiceError
  | CliUsageError
  | TracingError
  | UnknownError;

// Helper constructors
export const configError = (message: string) => new ConfigError({ message });
export const gitError = (message: string) => new GitError({ message });
export const networkError = (message: string) => new NetworkError({ message });
export const authError = (message: string) => new AuthError({ message });
export const unknownError = (details: unknown, options?: { message?: string }) =>
  new UnknownError({ message: options?.message ?? formatUnknownDetails(details), details });
export const externalToolError = (message: string, options?: { tool?: string; toolExitCode?: number; stderr?: string }) =>
  new ExternalToolError({ message, ...options });
export const fileSystemError = (message: string, path?: string) => new FileSystemError({ message, path });
export const statusCheckError = (message: string, failedComponents: string[]) => new StatusCheckError({ message, failedComponents });
export const healthCheckError = (message: string, tool?: string) => new HealthCheckError({ message, tool });
export const shellExecutionError = (
  command: string,
  args: readonly string[],
  message: string,
  options?: { cwd?: string; underlyingError?: unknown },
) => new ShellExecutionError({ command, args, message, ...options });
export const dockerServiceError = (message: string, options?: { service?: string; serviceExitCode?: number; stderr?: string }) =>
  new DockerServiceError({ message, ...options });
export const cliUsageError = (message: string, validationTag: string) => new CliUsageError({ message, validationTag });
