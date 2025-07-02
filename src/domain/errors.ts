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

// Union type for all domain errors
export type DevError = ConfigError | GitError | NetworkError | AuthError | UnknownError;

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
    case "UnknownError":
      return 1;
  }
};

// Helper constructors
export const configError = (reason: string) => new ConfigError({ reason });
export const gitError = (reason: string) => new GitError({ reason });
export const networkError = (reason: string) => new NetworkError({ reason });
export const authError = (reason: string) => new AuthError({ reason });
export const unknownError = (reason: unknown) => new UnknownError({ reason });

// Type guards (using Effect's built-in error matching)
export const isConfigError = (e: DevError): e is ConfigError => e._tag === "ConfigError";
export const isGitError = (e: DevError): e is GitError => e._tag === "GitError";
export const isNetworkError = (e: DevError): e is NetworkError => e._tag === "NetworkError";
export const isAuthError = (e: DevError): e is AuthError => e._tag === "AuthError";
export const isUnknownError = (e: DevError): e is UnknownError => e._tag === "UnknownError";
