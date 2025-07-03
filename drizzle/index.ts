import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";

import { PathServiceImpl } from "../src/domain/services/PathService";

const pathService = new PathServiceImpl();
const client = new Database(pathService.dbPath);

export const db = drizzle({ client: client });
