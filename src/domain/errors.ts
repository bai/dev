import { Data } from "effect";

// Tagged error classes for Effect.ts
export class ConfigError extends Data.TaggedError("ConfigError")<{
  readonly reason: string;
}> {}

export class GitError extends Data.TaggedError("GitError")<{
  readonly reason: string;
}> {}

export class NetworkError extends Data.TaggedError("NetworkError")<{
  readonly reason: string;
}> {}

export class AuthError extends Data.TaggedError("AuthError")<{
  readonly reason: string;
}> {}

export class UnknownError extends Data.TaggedError("UnknownError")<{
  readonly reason: unknown;
}> {}

export class ExternalToolError extends Data.TaggedError("ExternalToolError")<{
  readonly message: string;
  readonly tool?: string;
  readonly exitCode?: number;
  readonly stderr?: string;
}> {}

export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  readonly reason: string;
  readonly path?: string;
}> {}

export class StatusCheckError extends Data.TaggedError("StatusCheckError")<{
  readonly reason: string;
  readonly failedComponents: string[];
}> {}

export class HealthCheckError extends Data.TaggedError("HealthCheckError")<{
  readonly reason: string;
  readonly tool?: string;
}> {}

export class ShellExecutionError extends Data.TaggedError("ShellExecutionError")<{
  readonly command: string;
  readonly args: readonly string[];
  readonly reason: string;
  readonly cwd?: string;
  readonly underlyingError?: unknown;
}> {}

export class ShellTimeoutError extends Data.TaggedError("ShellTimeoutError")<{
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly cwd?: string;
}> {}

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
  | ShellTimeoutError
  | UnknownError;

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
    case "ShellTimeoutError":
      return 10;
    default:
      // This should never happen due to exhaustive typing, but satisfies linter
      return 1;
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
export const statusCheckError = (reason: string, failedComponents: string[]) =>
  new StatusCheckError({ reason, failedComponents });
export const healthCheckError = (reason: string, tool?: string) => new HealthCheckError({ reason, tool });
export const shellExecutionError = (
  command: string,
  args: readonly string[],
  reason: string,
  options?: { cwd?: string; underlyingError?: unknown },
) => new ShellExecutionError({ command, args, reason, ...options });
export const shellTimeoutError = (command: string, args: readonly string[], timeoutMs: number, cwd?: string) =>
  new ShellTimeoutError({ command, args, timeoutMs, cwd });

// Type guards (using Effect's built-in error matching)
export const isConfigError = (e: DevError): e is ConfigError => e._tag === "ConfigError";
export const isGitError = (e: DevError): e is GitError => e._tag === "GitError";
export const isNetworkError = (e: DevError): e is NetworkError => e._tag === "NetworkError";
export const isAuthError = (e: DevError): e is AuthError => e._tag === "AuthError";
export const isUnknownError = (e: DevError): e is UnknownError => e._tag === "UnknownError";
export const isExternalToolError = (e: DevError): e is ExternalToolError => e._tag === "ExternalToolError";
export const isFileSystemError = (e: DevError): e is FileSystemError => e._tag === "FileSystemError";
export const isStatusCheckError = (e: DevError): e is StatusCheckError => e._tag === "StatusCheckError";
export const isHealthCheckError = (e: DevError): e is HealthCheckError => e._tag === "HealthCheckError";
export const isShellExecutionError = (e: DevError): e is ShellExecutionError => e._tag === "ShellExecutionError";
export const isShellTimeoutError = (e: DevError): e is ShellTimeoutError => e._tag === "ShellTimeoutError";
