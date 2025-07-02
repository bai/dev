import { z } from "zod";

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
};
