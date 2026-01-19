#!/usr/bin/env bun
import * as z from "zod";

import { configSchema } from "../src/domain/config-schema";

const file = process.argv[2] ?? "config.schema.json";

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

      schema.description = [schema.description || "", `default: \`${schema.default}\``]
        .filter(Boolean)
        .join("\n\n")
        .trim();
    }
  },
}) as Record<string, unknown> & {
  allowComments?: boolean;
  allowTrailingCommas?: boolean;
};

// Used for JSON LSPs since config supports JSONC
result.allowComments = true;
result.allowTrailingCommas = true;

await Bun.write(file, JSON.stringify(result, null, 2) + "\n");

console.log(`Generated JSON Schema: ${file}`);
