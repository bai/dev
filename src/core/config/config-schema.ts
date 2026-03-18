import * as z from "zod";

import type { GitProviderType, LogLevel } from "~/core/models";

// Log level schema
const logLevelSchema: z.ZodType<LogLevel> = z.enum(["debug", "info", "warning", "error", "fatal"]);

// Runtime keeps mise config payloads opaque. `config.schema.json` rewrites these
// properties to the external mise schema for editor validation, and rendering
// adapters must fail without overwriting existing config files.
const miseConfigSchema = z.unknown();

const gitProviderSchema: z.ZodType<GitProviderType> = z.enum(["github", "gitlab"]);

const telemetryAxiomSchema = z
  .object({
    endpoint: z.url().describe("Axiom OTLP traces endpoint"),
    apiKey: z.string().min(1).describe("Axiom API key used for OTLP trace ingestion"),
    dataset: z.string().min(1).describe("Axiom dataset used for trace ingestion"),
  })
  .describe("Axiom OTLP exporter settings");

const telemetryDisabledSchema = z.object({
  mode: z.literal("disabled"),
  axiom: telemetryAxiomSchema.optional(),
});

const telemetryConsoleSchema = z.object({
  mode: z.literal("console"),
  axiom: telemetryAxiomSchema.optional(),
});

const telemetryAxiomModeSchema = z.object({
  mode: z.literal("axiom"),
  axiom: telemetryAxiomSchema,
});

const telemetryConfigSchema = z
  .discriminatedUnion("mode", [telemetryDisabledSchema, telemetryConsoleSchema, telemetryAxiomModeSchema])
  .default({ mode: "disabled" })
  .describe("Telemetry mode: 'console' for local output, 'axiom' for Axiom export, 'disabled' to turn off");

const servicePortSchema = z.number().int().min(1).max(65535).optional().describe("Local host port to expose the service on");

const serviceConfigSchema = z
  .object({
    port: servicePortSchema,
  })
  .passthrough()
  .describe("Service-specific configuration");

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
  defaultOrg: z.string().default("acmesoftware").describe("Default organization for repository operations"),
  defaultProvider: gitProviderSchema.optional().default("github").describe("Default git provider when not specified (github or gitlab)"),
  baseSearchPath: z.string().optional().default("~/src").describe("Base directory for searching and cloning repositories"),
  logLevel: logLevelSchema.optional().default("info").describe("Logging verbosity: debug, info, warning, error, or fatal"),
  telemetry: telemetryConfigSchema,
  orgToProvider: z
    .record(z.string(), gitProviderSchema)
    .optional()
    .default({})
    .describe(
      "Map organization names to their git provider (e.g., { 'mycompany': 'gitlab' }); organization keys are matched case-insensitively",
    ),
  miseGlobalConfig: miseConfigSchema.optional().describe("Mise configuration applied globally ($XDG_CONFIG_HOME/mise)"),
  miseRepoConfig: miseConfigSchema.optional().describe("Mise configuration applied per-repository (.mise.toml)"),
  services: servicesConfigSchema,
});

// Use Zod's inferred type as the source of truth
// This ensures the type matches what Zod actually produces (with defaults applied)
export type Config = z.infer<typeof configSchema>;
