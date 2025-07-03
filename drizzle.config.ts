import type { Config } from "drizzle-kit";

import { devDbPath } from "~/lib/constants";

export default {
  out: "./drizzle/migrations",
  schema: "./drizzle/schema.ts",
  dialect: "sqlite",
  casing: "snake_case",
  introspect: {
    casing: "preserve",
  },
  dbCredentials: {
    url: `file:${devDbPath}`,
  },
} satisfies Config;
