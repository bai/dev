import type { Config } from "drizzle-kit";

import { PathServiceImpl } from "./src/domain/services/PathService";

const pathService = new PathServiceImpl();

export default {
  out: "./drizzle/migrations",
  schema: "./drizzle/schema.ts",
  dialect: "sqlite",
  casing: "snake_case",
  introspect: {
    casing: "preserve",
  },
  dbCredentials: {
    url: `file:${pathService.dbPath}`,
  },
} satisfies Config;
