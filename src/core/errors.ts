import { Schema, absurd } from "effect";

import type { TracingError } from "~/core/observability/tracing-port";

// Re-export TracingError for convenience
export { TracingError } from "~/core/observability/tracing-port";

// Tagged error classes for Effect.ts
export class ConfigError extends Schema.TaggedError<ConfigError>()("ConfigError", {
  reason: Schema.String,
}) {}

export class GitError extends Schema.TaggedError<GitError>()("GitError", {
  reason: Schema.String,
}) {}

export class NetworkError extends Schema.TaggedError<NetworkError>()("NetworkError", {
  reason: Schema.String,
}) {}

export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  reason: Schema.String,
}) {}

export class UnknownError extends Schema.TaggedError<UnknownError>()("UnknownError", {
  reason: Schema.Unknown,
}) {}

export class ExternalToolError extends Schema.TaggedError<ExternalToolError>()("ExternalToolError", {
  message: Schema.String,
  tool: Schema.optional(Schema.String),
  exitCode: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}

export class FileSystemError extends Schema.TaggedError<FileSystemError>()("FileSystemError", {
  reason: Schema.String,
  path: Schema.optional(Schema.String),
}) {}

export class StatusCheckError extends Schema.TaggedError<StatusCheckError>()("StatusCheckError", {
  reason: Schema.String,
  failedComponents: Schema.Array(Schema.String),
}) {}

export class HealthCheckError extends Schema.TaggedError<HealthCheckError>()("HealthCheckError", {
  reason: Schema.String,
  tool: Schema.optional(Schema.String),
}) {}

export class ShellExecutionError extends Schema.TaggedError<ShellExecutionError>()("ShellExecutionError", {
  command: Schema.String,
  args: Schema.Array(Schema.String),
  reason: Schema.String,
  cwd: Schema.optional(Schema.String),
  underlyingError: Schema.optional(Schema.Unknown),
}) {}

export class DockerServiceError extends Schema.TaggedError<DockerServiceError>()("DockerServiceError", {
  reason: Schema.String,
  service: Schema.optional(Schema.String),
  exitCode: Schema.optional(Schema.Number),
  stderr: Schema.optional(Schema.String),
}) {}

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
  | TracingError
  | UnknownError;

const devErrorTags = new Set<DevError["_tag"]>([
  "ConfigError",
  "GitError",
  "NetworkError",
  "AuthError",
  "ExternalToolError",
  "FileSystemError",
  "StatusCheckError",
  "HealthCheckError",
  "ShellExecutionError",
  "DockerServiceError",
  "TracingError",
  "UnknownError",
]);

export const isDevError = (error: unknown): error is DevError =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  typeof error._tag === "string" &&
  devErrorTags.has(error._tag as DevError["_tag"]);

// Exit code mapping
export const exitCode = (error: DevError): number => {
  switch (error._tag) {
    case "ConfigError":
      return 2;
    case "GitError":
      return 3;
    case "NetworkError":
      return 4;
    case "AuthError":
      return 5;
    case "ExternalToolError":
      return 6;
    case "FileSystemError":
      return 7;
    case "StatusCheckError":
      return 3;
    case "UnknownError":
      return 1;
    case "HealthCheckError":
      return 8;
    case "ShellExecutionError":
      return 9;
    case "DockerServiceError":
      return 11;
    case "TracingError":
      return 12;
    default:
      return absurd(error);
  }
};

// Helper constructors
export const configError = (reason: string) => new ConfigError({ reason });
export const gitError = (reason: string) => new GitError({ reason });
export const networkError = (reason: string) => new NetworkError({ reason });
export const authError = (reason: string) => new AuthError({ reason });
export const unknownError = (reason: unknown) => new UnknownError({ reason });
export const externalToolError = (message: string, options?: { tool?: string; exitCode?: number; stderr?: string }) =>
  new ExternalToolError({ message, ...options });
export const fileSystemError = (reason: string, path?: string) => new FileSystemError({ reason, path });
export const statusCheckError = (reason: string, failedComponents: string[]) => new StatusCheckError({ reason, failedComponents });
export const healthCheckError = (reason: string, tool?: string) => new HealthCheckError({ reason, tool });
export const shellExecutionError = (
  command: string,
  args: readonly string[],
  reason: string,
  options?: { cwd?: string; underlyingError?: unknown },
) => new ShellExecutionError({ command, args, reason, ...options });
export const dockerServiceError = (reason: string, options?: { service?: string; exitCode?: number; stderr?: string }) =>
  new DockerServiceError({ reason, ...options });

/**
 * Extracts a human-readable error message from various error types
 * @param error - The error to extract message from
 * @returns Human-readable error message string
 */
export const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    if ("reason" in error && typeof error.reason === "string" && error.reason.length > 0) {
      return error.reason;
    }

    // Check if it's an Effect-TS tagged error with empty message
    if (error.message === "" && error && typeof error === "object" && "_tag" in error) {
      // Handle Effect domain errors that extend Error but have empty message
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }
    return error.message;
  }

  if (error && typeof error === "object") {
    if ("reason" in error && typeof error.reason === "string" && error.reason.length > 0) {
      return error.reason;
    }

    if ("message" in error) {
      return String(error.message);
    }

    // Handle Effect CLI errors with nested structure
    if (
      "error" in error &&
      error.error &&
      typeof error.error === "object" &&
      "value" in error.error &&
      error.error.value &&
      typeof error.error.value === "object" &&
      "value" in error.error.value
    ) {
      return String(error.error.value.value);
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
};
