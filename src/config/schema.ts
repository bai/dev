import { z } from "zod";

import type { Config, GitProviderType, MiseConfig } from "../domain/models";

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

export const configSchema: z.ZodType<Config> = z.object({
  version: z.literal(3),
  configUrl: z.string().url(),
  defaultOrg: z.string(),
  paths: z.object({
    base: z.string(),
  }),
  telemetry: z.object({
    enabled: z.boolean(),
  }),
  plugins: z.object({
    git: z.array(z.string().url()),
  }),
  // Additional fields from dev-config.ts
  orgToProvider: z
    .record(z.string(), gitProviderSchema)
    .optional()
    .describe("Map of organizations to their preferred git provider"),
  miseGlobalConfig: miseConfigSchema.optional().describe("Mise global configuration settings"),
  miseRepoConfig: miseConfigSchema.optional().describe("Mise repository configuration settings"),
});

// Export Config type that was moved to domain
export type { Config } from "../domain/models";

// Default configuration
export const defaultConfig: Config = {
  version: 3,
  configUrl: "https://raw.githubusercontent.com/acme/dev-configs/main/org.json",
  defaultOrg: "acme",
  paths: {
    base: "~/src",
  },
  telemetry: {
    enabled: true,
  },
  plugins: {
    git: [],
  },
  orgToProvider: {
    "gitlab-org": "gitlab",
  },
};

// Re-export schema for other modules
export { miseConfigSchema };
