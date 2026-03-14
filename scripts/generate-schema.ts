#!/usr/bin/env bun
import * as z from "zod";

import { configSchema } from "../src/core/config/config-schema";

const file = process.argv[2] ?? "config.schema.json";
const miseSchemaRef = "https://mise.jdx.dev/schema/mise.json";

type JsonObject = Record<string, unknown>;
type JsonSchemaDocument = JsonObject & {
  allowComments?: boolean;
  allowTrailingCommas?: boolean;
  properties?: JsonObject;
};

const isJsonObject = (value: unknown): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

const getJsonObject = (value: unknown, message: string): JsonObject => {
  if (!isJsonObject(value)) {
    throw new Error(message);
  }

  return value;
};

const replaceMiseConfigProperty = (schema: JsonSchemaDocument, propertyName: "miseGlobalConfig" | "miseRepoConfig"): void => {
  const properties = getJsonObject(schema.properties, "Generated config schema must contain object properties");
  const currentProperty = getJsonObject(properties[propertyName], `Generated config schema is missing '${propertyName}'`);
  const description = typeof currentProperty.description === "string" ? currentProperty.description : undefined;

  properties[propertyName] = {
    ...(description ? { description } : {}),
    allOf: [{ $ref: miseSchemaRef }],
  };
};

const result = z.toJSONSchema(configSchema, {
  io: "input", // Generate input shape (treats optional().default() as not required)
  override(ctx) {
    const schema = ctx.jsonSchema;

    // Preserve strictness: set additionalProperties: false for objects
    if (schema && typeof schema === "object" && schema.type === "object" && schema.additionalProperties === undefined) {
      schema.additionalProperties = false;
    }

    // Add examples and default descriptions for string fields with defaults
    if (schema && typeof schema === "object" && "type" in schema && schema.type === "string" && schema?.default) {
      if (!schema.examples) {
        schema.examples = [schema.default];
      }

      schema.description = [schema.description || "", `default: \`${schema.default}\``].filter(Boolean).join("\n\n").trim();
    }
  },
}) as JsonSchemaDocument;

replaceMiseConfigProperty(result, "miseGlobalConfig");
replaceMiseConfigProperty(result, "miseRepoConfig");

// Used for JSON LSPs since config supports JSONC
result.allowComments = true;
result.allowTrailingCommas = true;

await Bun.write(file, JSON.stringify(result, null, 2) + "\n");

console.log(`Generated JSON Schema: ${file}`);
