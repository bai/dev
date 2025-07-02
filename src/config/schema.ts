import { z } from "zod";

// Mise configuration schema (imported from tools/mise.ts concepts)
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
    })
    .optional(),
});

const gitProviderSchema = z.enum(["github", "gitlab"]);

export const configSchema = z.object({
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

export type Config = z.infer<typeof configSchema>;

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

// Re-export mise config types for other modules
export type MiseConfig = z.infer<typeof miseConfigSchema>;
export { miseConfigSchema };
