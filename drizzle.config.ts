import os from "os";
import path from "path";

import type { Config } from "drizzle-kit";

// XDG Base Directory Specification compliant path resolution
const XDG_DATA_HOME = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
const dbPath = path.join(XDG_DATA_HOME, "dev", "dev.db");

export default {
  out: "./drizzle/migrations",
  schema: "./drizzle/schema.ts",
  dialect: "sqlite",
  casing: "snake_case",
  introspect: {
    casing: "preserve",
  },
  dbCredentials: {
    url: `file:${dbPath}`,
  },
} satisfies Config;
