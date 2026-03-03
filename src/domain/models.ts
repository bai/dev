export type GitProviderType = "github" | "gitlab";
export type LogLevel = "debug" | "info" | "warning" | "error" | "fatal";

// Core domain models

export interface CommandRun {
  readonly id: string;
  readonly cli_version: string;
  readonly command_name: string;
  readonly arguments?: string;
  readonly exit_code?: number;
  readonly cwd: string;
  readonly started_at: Date;
  readonly finished_at?: Date;
  readonly duration_ms?: number;
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
