import { Schema } from "effect";

import type { TracingError } from "~/core/observability/tracing-port";

// Re-export TracingError for convenience
export { TracingError } from "~/core/observability/tracing-port";

const defaultProgramExitCode = 1;

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
