import os from "os";
import path from "path";

import type { Config } from "drizzle-kit";

const stateDir = process.env.DEV_STATE_DIR || path.join(os.homedir(), ".dev", "state");
const dbPath = path.join(stateDir, "dev.db");

export default {
  out: "./drizzle/migrations",
  schema: "./drizzle/schema.ts",
  dialect: "sqlite",
  casing: "snake_case",
  dbCredentials: {
    url: `file:${dbPath}`,
  },
} satisfies Config;
