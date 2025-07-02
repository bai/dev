import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { devDbPath } from "~/lib/constants";

const client = new Database(devDbPath);

export const db = drizzle({ client: client });
