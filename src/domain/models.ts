// Core configuration types (moved from config schema to maintain proper layering)

export interface MiseConfig {
  readonly min_version?: string;
  readonly env?: Record<string, any> & {
    readonly _?: {
      readonly path?: string[];
      readonly file?: string[];
    };
  };
  readonly tools?: Record<string, string | string[]>;
  readonly settings?: {
    readonly idiomatic_version_file_enable_tools?: string[];
    readonly trusted_config_paths?: string[];
  };
}

export type GitProviderType = "github" | "gitlab";
export type LogLevel = "debug" | "info" | "warning" | "error" | "fatal";

// Built-in health check tools configuration
export interface BuiltInHealthCheck {
  readonly command: string;
  readonly versionPattern?: string;
  readonly timeout?: number;
  readonly parseOutput?: (
    stdout: string,
    stderr: string,
  ) => {
    readonly version?: string;
    readonly status?: "ok" | "warning" | "fail";
    readonly notes?: string;
  };
}

export interface Config {
  readonly version: 3;
  readonly configUrl: string;
  readonly defaultOrg: string;
  readonly logLevel?: LogLevel;
  readonly telemetry: {
    readonly enabled: boolean;
  };
  readonly orgToProvider?: Record<string, GitProviderType>;
  readonly miseGlobalConfig?: MiseConfig;
  readonly miseRepoConfig?: MiseConfig;
  readonly builtInHealthChecks?: Record<string, BuiltInHealthCheck>;
}

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
