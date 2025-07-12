import { z } from "zod/v4";

import type { Config, GitProviderType, LogLevel } from "./models";

// Log level schema
const logLevelSchema: z.ZodType<LogLevel> = z.enum(["debug", "info", "warning", "error", "fatal"]);

// Mise configuration schema (matching domain types)
const miseConfigSchema = z.object({
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
      experimental: z.boolean().optional(),
    })
    .optional(),
});

const gitProviderSchema: z.ZodType<GitProviderType> = z.enum(["github", "gitlab"]);

export const configSchema = z.object({
  version: z.number().optional(),
  configUrl: z.url(),
  defaultOrg: z.string(),
  defaultProvider: gitProviderSchema.optional().default("github"),
  baseSearchPath: z.string().optional().describe("Base directory for searching repositories"),
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
});

// Default configuration
export const defaultConfig: Config = {
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

// Re-export Config type and schemas for other modules
export type { Config } from "./models";
export { miseConfigSchema, logLevelSchema };