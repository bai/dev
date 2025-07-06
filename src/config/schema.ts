import { z } from "zod";

import type { Config, CustomHealthCheck, GitProviderType, LogLevel, MiseConfig } from "../domain/models";

// Log level schema
const logLevelSchema: z.ZodType<LogLevel> = z.enum(["debug", "info", "warn", "error"]);

// Mise configuration schema (matching domain types)
const miseConfigSchema: z.ZodType<MiseConfig> = z.object({
  min_version: z.string().optional(),
  env: z
    .record(z.string(), z.any())
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
    })
    .optional(),
});

const gitProviderSchema: z.ZodType<GitProviderType> = z.enum(["github", "gitlab"]);

// Custom health check schema
const customHealthCheckSchema: z.ZodType<Omit<CustomHealthCheck, "parseOutput">> = z.object({
  command: z.string(),
  versionPattern: z.string().optional(),
  timeout: z.number().optional(),
});

export const configSchema: z.ZodType<Omit<Config, "customHealthChecks"> & { customHealthChecks?: Record<string, Omit<CustomHealthCheck, "parseOutput">> }> = z.object({
  version: z.literal(3),
  configUrl: z.string().url(),
  defaultOrg: z.string(),
  logLevel: logLevelSchema.optional().default("info"),
  telemetry: z.object({
    enabled: z.boolean(),
  }),
  orgToProvider: z
    .record(z.string(), gitProviderSchema)
    .optional()
    .describe("Map of organizations to their preferred git provider"),
  miseGlobalConfig: miseConfigSchema.optional().describe("Mise global configuration settings"),
  miseRepoConfig: miseConfigSchema.optional().describe("Mise repository configuration settings"),
  customHealthChecks: z
    .record(z.string(), customHealthCheckSchema)
    .optional()
    .describe("Custom health check tools and their configurations"),
});

// Export Config type that was moved to domain
export type { Config } from "../domain/models";

// Default configuration
export const defaultConfig: Config = {
  version: 3,
  configUrl: "https://gist.githubusercontent.com/bai/d5a4a92350e67af8aba1b9db33d5f077/raw/config.json",
  defaultOrg: "flywheelsoftware",
  logLevel: "info",
  telemetry: {
    enabled: true,
  },
  orgToProvider: {
    flywheelsoftware: "gitlab",
  },
};

// Re-export schema for other modules
export { miseConfigSchema, logLevelSchema };
