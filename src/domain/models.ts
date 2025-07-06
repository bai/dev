import { Context, type Effect, type Layer } from "effect";

import type { DevError } from "./errors";

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

export interface Config {
  version: 3;
  configUrl: string;
  defaultOrg: string;
  logLevel?: LogLevel;
  telemetry: {
    enabled: boolean;
  };
  orgToProvider?: Record<string, GitProviderType>;
  miseGlobalConfig?: MiseConfig;
  miseRepoConfig?: MiseConfig;
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
