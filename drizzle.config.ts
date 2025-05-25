import type { Config } from "drizzle-kit";

export default {
  out: "./src/drizzle/migrations",
  schema: "./src/drizzle/schema.ts",
  dialect: "sqlite",
  casing: "snake_case",
  introspect: {
    casing: "preserve",
  },
  dbCredentials: {
    url: "file:db.sqlite",
  },
} satisfies Config;
