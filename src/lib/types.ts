import { z } from "zod/v4";

export const gitProviderSchema = z.enum(["github", "gitlab"]);

export type GitProvider = z.infer<typeof gitProviderSchema>;

export const miseConfigSchema = z.object({
  env: z.object({ _: z.object({ path: z.array(z.string()) }) }),
  tools: z.record(z.string(), z.string()),
  settings: z.object({
    idiomatic_version_file_enable_tools: z.array(z.string()),
    trusted_config_paths: z.array(z.string()),
  }),
});

export const devConfigSchema = z.object({
  defaultOrg: z.string(),
  orgToProvider: z.record(z.string(), gitProviderSchema),
  mise: z.object({
    trusted_config_paths: z.array(z.string()),
  }),
});
