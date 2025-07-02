import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { devDir } from "~/lib/constants";
import { logger } from "~/lib/logger";

import { db } from "../../drizzle";

export async function ensureDatabaseIsUpToDate() {
  logger.debug("🔄 Checking for database migrations...");
  migrate(db, { migrationsFolder: `${devDir}/src/drizzle/migrations` });
  logger.debug("✅ Database migrations applied");
}
