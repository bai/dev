import { migrate } from "drizzle-orm/bun-sqlite/migrator";

import { db } from "~/drizzle";

migrate(db, { migrationsFolder: "./src/drizzle/migrations" });
