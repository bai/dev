

// Core configuration types (moved from config schema to maintain proper layering)
export interface MiseConfig {
  min_version?: string;
  env?: Record<string, any> & {
    _?: {
      path?: string[];
      file?: string[];
    };
  };
  tools?: Record<string, string | string[]>;
  settings?: {
    idiomatic_version_file_enable_tools?: string[];
    trusted_config_paths?: string[];
  };
}

export type GitProviderType = "github" | "gitlab";
export type LogLevel = "debug" | "info" | "warn" | "error";

// Built-in health check tools configuration
export interface BuiltInHealthCheck {
  readonly command: string;
  readonly versionPattern?: string;
  readonly timeout?: number;
  readonly parseOutput?: (stdout: string, stderr: string) => {
    readonly version?: string;
    readonly status?: "ok" | "warn" | "fail";
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
  id: string;
  cli_version: string;
  command_name: string;
  arguments?: string;
  exit_code?: number;
  cwd: string;
  started_at: Date;
  finished_at?: Date;
  duration_ms?: number;
}

export interface GitProvider {
  name: "github" | "gitlab";
  baseUrl: string;
}

export interface Repository {
  name: string;
  organization: string;
  provider: GitProvider;
  cloneUrl: string;
}
