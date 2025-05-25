import path from "node:path";

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { devDir } from "~/lib/constants";

const client = new Database(path.join(devDir, "db.sqlite"));

export const db = drizzle({ client: client });
