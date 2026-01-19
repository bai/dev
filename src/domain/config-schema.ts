import { z } from "zod/v4";

import type { GitProviderType, LogLevel, TelemetryMode } from "./models";

// Log level schema
const logLevelSchema: z.ZodType<LogLevel> = z.enum(["debug", "info", "warning", "error", "fatal"]);

// Mise configuration schema (matching domain types)
const miseConfigSchema = z.object({
  min_version: z.string().optional(),
  env: z
    .record(z.string(), z.string())
    .and(
      z.object({
        _: z
          .object({
            path: z.array(z.string()).optional(),
            file: z.array(z.string()).optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  tools: z.record(z.string(), z.string().or(z.array(z.string()))).optional(),
  settings: z
    .object({
      idiomatic_version_file_enable_tools: z.array(z.string()).optional(),
      trusted_config_paths: z.array(z.string()).optional(),
      experimental: z.boolean().optional(),
    })
    .optional(),
});

const gitProviderSchema: z.ZodType<GitProviderType> = z.enum(["github", "gitlab"]);

const telemetryModeSchema: z.ZodType<TelemetryMode> = z.enum(["console", "remote", "disabled"]);

const telemetryConfigSchema = z.object({
  mode: telemetryModeSchema.optional().default("remote"),
});

const serviceNameSchema = z.enum(["postgres17", "postgres18", "valkey"]);

const servicesConfigSchema = z.object({
  enabled: z.array(serviceNameSchema).optional().default(["postgres18", "valkey"]),
});

export const configSchema = z.object({
  version: z.number().optional(),
  configUrl: z.url().default("https://raw.githubusercontent.com/bai/dev/refs/heads/main/config.json"),
  defaultOrg: z.string().default("flywheelsoftware"),
  defaultProvider: gitProviderSchema.optional().default("github"),
  baseSearchPath: z.string().optional().default("~/src").describe("Base directory for searching repositories"),
  logLevel: logLevelSchema.optional().default("info"),
  telemetry: telemetryConfigSchema.default({ mode: "remote" }),
  orgToProvider: z
    .record(z.string(), gitProviderSchema)
    .optional()
    .default({})
    .describe("Map of organizations to their preferred git provider"),
  miseGlobalConfig: miseConfigSchema.optional().describe("Mise global configuration settings"),
  miseRepoConfig: miseConfigSchema.optional().describe("Mise repository configuration settings"),
  services: servicesConfigSchema.default({ enabled: ["postgres18", "valkey"] }),
});

// Re-export schemas for other modules
export { miseConfigSchema, logLevelSchema };

// Use Zod's inferred type as the source of truth
// This ensures the type matches what Zod actually produces (with defaults applied)
export type Config = z.infer<typeof configSchema>;
