import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: text().primaryKey(),
  cli_version: text().notNull(),
  command_name: text().notNull(),
  arguments: text(),
  exit_code: integer(),
  cwd: text().notNull(),
  started_at: integer({ mode: "timestamp" }).notNull(),
  finished_at: integer({ mode: "timestamp" }),
  duration_ms: integer().generatedAlwaysAs(() => sql`finished_at - started_at`),
});
