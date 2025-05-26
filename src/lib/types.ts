import { z } from "zod/v4";

export const gitProviderSchema = z.enum(["github", "gitlab"]);

export type GitProvider = z.infer<typeof gitProviderSchema>;

/**
 * Mise config schema
 * @see https://mise.jdx.dev/configuration/settings.html
 */
export const miseConfigSchema = z.object({
  env: z.object({ _: z.object({ path: z.array(z.string()) }) }),
  tools: z.record(z.string(), z.string()),
  settings: z.object({
    idiomatic_version_file_enable_tools: z.array(z.string()),
    trusted_config_paths: z.array(z.string()),
  }),
});

export const devConfigSchema = z.object({
  // url to the dev config file, set to whatever URL was used to install dev
  configUrl: z.url().default("https://raw.githubusercontent.com/bai/dev/main/hack/configs/dev-config.json"),
  // default organization to use for cloning repositories
  defaultOrg: z.string().default("bai"),
  // map of organizations to their preferred git provider
  orgToProvider: z.record(z.string(), gitProviderSchema).default({
    "gitlab-org": "gitlab",
  }),
  // list of trusted config paths for mise
  mise: z
    .object({
      trusted_config_paths: z.array(z.string()),
    })
    .optional(),
});
