import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { devDir } from "~/lib/constants";
import { db } from "~/drizzle";

export async function ensureDatabaseIsUpToDate() {
  // console.log("🔄 Checking for database migrations...");
  migrate(db, { migrationsFolder: `${devDir}/src/drizzle/migrations` });
  // console.log("✅ Database migrations applied");
}
