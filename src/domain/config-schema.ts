import * as z from "zod";

import type { GitProviderType, LogLevel, TelemetryMode } from "./models";

// Log level schema
const logLevelSchema: z.ZodType<LogLevel> = z.enum(["debug", "info", "warning", "error", "fatal"]);

// Mise configuration schema (matching domain types)
const miseConfigSchema = z.object({
  min_version: z.string().optional().describe("Minimum required mise version"),
  env: z
    .record(z.string(), z.string())
    .and(
      z.object({
        _: z
          .object({
            path: z.array(z.string()).optional().describe("Additional PATH entries"),
            file: z.array(z.string()).optional().describe("Environment files to load"),
          })
          .optional()
          .describe("Special environment configuration"),
      }),
    )
    .optional()
    .describe("Environment variables to set"),
  tools: z
    .record(z.string(), z.string().or(z.array(z.string())))
    .optional()
    .describe("Tool versions to install (e.g., node: 'lts', python: ['3.11', '3.12'])"),
  settings: z
    .object({
      idiomatic_version_file_enable_tools: z
        .array(z.string())
        .optional()
        .describe("Tools that use idiomatic version files (.nvmrc, .python-version)"),
      trusted_config_paths: z.array(z.string()).optional().describe("Paths to trust for mise configuration"),
      experimental: z.boolean().optional().describe("Enable experimental mise features"),
    })
    .optional()
    .describe("Mise settings"),
});

const gitProviderSchema: z.ZodType<GitProviderType> = z.enum(["github", "gitlab"]);

const telemetryModeSchema: z.ZodType<TelemetryMode> = z.enum(["console", "remote", "disabled"]);

const telemetryConfigSchema = z
  .object({
    mode: telemetryModeSchema
      .optional()
      .default("remote")
      .describe("Telemetry mode: 'console' for local output, 'remote' for cloud, 'disabled' to turn off"),
  })
  .describe("Telemetry and observability settings");

// Per-service config (empty for now, reserved for future customization)
const serviceConfigSchema = z
  .object({})
  .passthrough()
  .describe("Service-specific configuration (reserved for future use)");

// Services config: keys are enabled services, values are per-service config
const servicesConfigSchema = z
  .object({
    postgres17: serviceConfigSchema.optional().describe("PostgreSQL 17 database service"),
    postgres18: serviceConfigSchema.optional().describe("PostgreSQL 18 database service"),
    valkey: serviceConfigSchema.optional().describe("Valkey (Redis-compatible) cache service"),
  })
  .optional()
  .default({})
  .describe("Docker services to enable. Include a service key to enable it");

export const configSchema = z.object({
  $schema: z.string().optional().describe("JSON Schema reference for IDE validation and autocomplete"),
  version: z.number().optional().describe("Configuration schema version for future migrations"),
  configUrl: z
    .url()
    .default("https://raw.githubusercontent.com/bai/dev/refs/heads/main/config.json")
    .describe("Remote URL to fetch shared configuration from"),
  defaultOrg: z.string().default("flywheelsoftware").describe("Default organization for repository operations"),
  defaultProvider: gitProviderSchema
    .optional()
    .default("github")
    .describe("Default git provider when not specified (github or gitlab)"),
  baseSearchPath: z
    .string()
    .optional()
    .default("~/src")
    .describe("Base directory for searching and cloning repositories"),
  logLevel: logLevelSchema
    .optional()
    .default("info")
    .describe("Logging verbosity: debug, info, warning, error, or fatal"),
  telemetry: telemetryConfigSchema.default({ mode: "remote" }),
  orgToProvider: z
    .record(z.string(), gitProviderSchema)
    .optional()
    .default({})
    .describe("Map organization names to their git provider (e.g., { 'mycompany': 'gitlab' })"),
  miseGlobalConfig: miseConfigSchema.optional().describe("Mise configuration applied globally (~/.config/mise)"),
  miseRepoConfig: miseConfigSchema.optional().describe("Mise configuration applied per-repository (.mise.toml)"),
  services: servicesConfigSchema,
});

// Re-export schemas for other modules
export { miseConfigSchema, logLevelSchema };

// Use Zod's inferred type as the source of truth
// This ensures the type matches what Zod actually produces (with defaults applied)
export type Config = z.infer<typeof configSchema>;
