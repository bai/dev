export type GitProviderType = "github" | "gitlab";
export type LogLevel = "debug" | "info" | "warning" | "error" | "fatal";

// Core domain models

export interface CommandRun {
  readonly id: string;
  readonly cliVersion: string;
  readonly commandName: string;
  readonly arguments?: string;
  readonly exitCode?: number;
  readonly cwd: string;
  readonly startedAt: Date;
  readonly finishedAt?: Date;
  readonly durationMs?: number;
}

export interface GitProvider {
  readonly name: "github" | "gitlab";
  readonly baseUrl: string;
}

export interface Repository {
  readonly name: string;
  readonly organization: string;
  readonly provider: GitProvider;
  readonly cloneUrl: string;
}

export interface GitInfo {
  readonly branch: string | null;
  readonly remote: string | null;
}

export interface EnvironmentInfo {
  readonly currentDirectory: string;
  readonly git: GitInfo;
}
