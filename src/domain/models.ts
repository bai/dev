import { Context, type Effect, type Layer } from "effect";

import type { DevError } from "./errors";

// Re-export Config from config schema to avoid duplication
export type { Config, MiseConfig } from "../config/schema";

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

export interface CliCommandSpec {
  name: string;
  description: string;
  help?: string;
  aliases?: string[];
  arguments?: CommandArgument[];
  options?: CommandOption[];
  exec: (context: CommandContext) => Effect.Effect<void, DevError, any>;
}

export interface CommandArgument {
  name: string;
  description: string;
  required?: boolean;
  variadic?: boolean;
  defaultValue?: any;
}

export interface CommandOption {
  flags: string;
  description: string;
  defaultValue?: any;
  choices?: string[];
  required?: boolean;
  parser?: (value: string) => any;
}

export interface CommandContext {
  args: Record<string, any>;
  options: Record<string, any>;
}

export interface Logger {
  info(message: string, ...args: any[]): Effect.Effect<void>;
  warn(message: string, ...args: any[]): Effect.Effect<void>;
  error(message: string, ...args: any[]): Effect.Effect<void>;
  debug(message: string, ...args: any[]): Effect.Effect<void>;
  success(message: string, ...args: any[]): Effect.Effect<void>;
  child(prefix: string): Logger;
}

export interface ConfigManager {
  get<T = any>(key: string, defaultValue?: T): T;
  set(key: string, value: any): Effect.Effect<void>;
  has(key: string): boolean;
  getAll(): Record<string, any>;
}

export interface AppModule {
  commands: CliCommandSpec[];
  layers?: Layer.Layer<any, never, any>;
  hooks?: {
    onStart?: Effect.Effect<void, never, any>;
  };
}

// Service tags for Effect Context system
export class LoggerService extends Context.Tag("LoggerService")<LoggerService, Logger>() {}

export class ConfigService extends Context.Tag("ConfigService")<ConfigService, ConfigManager>() {}

export class ClockService extends Context.Tag("ClockService")<
  ClockService,
  {
    now(): Effect.Effect<Date>;
    timestamp(): Effect.Effect<number>;
  }
>() {}
