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

export class UserInputError extends Data.TaggedError("UserInputError")<{
  readonly reason: string;
}> {}

export class CLIError extends Data.TaggedError("CLIError")<{
  readonly reason: string;
}> {}

// Union type for all domain errors
export type DevError =
  | ConfigError
  | GitError
  | NetworkError
  | AuthError
  | UnknownError
  | ExternalToolError
  | FileSystemError
  | UserInputError
  | CLIError;

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
    case "UserInputError":
      return 8;
    case "CLIError":
      return 9;
    case "UnknownError":
      return 1;
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
export const userInputError = (reason: string) => new UserInputError({ reason });
export const cliError = (reason: string) => new CLIError({ reason });

// Type guards (using Effect's built-in error matching)
export const isConfigError = (e: DevError): e is ConfigError => e._tag === "ConfigError";
export const isGitError = (e: DevError): e is GitError => e._tag === "GitError";
export const isNetworkError = (e: DevError): e is NetworkError => e._tag === "NetworkError";
export const isAuthError = (e: DevError): e is AuthError => e._tag === "AuthError";
export const isUnknownError = (e: DevError): e is UnknownError => e._tag === "UnknownError";
export const isExternalToolError = (e: DevError): e is ExternalToolError => e._tag === "ExternalToolError";
export const isFileSystemError = (e: DevError): e is FileSystemError => e._tag === "FileSystemError";
export const isUserInputError = (e: DevError): e is UserInputError => e._tag === "UserInputError";
export const isCLIError = (e: DevError): e is CLIError => e._tag === "CLIError";
