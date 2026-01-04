import { desc, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const runs = sqliteTable("runs", {
  id: text().primaryKey(),
  cli_version: text().notNull(),
  command_name: text().notNull(),
  arguments: text(),
  exit_code: integer(),
  cwd: text().notNull(),
  error_tag: text(),
  error_reason: text(),
  started_at: integer({ mode: "timestamp" }).notNull(),
  finished_at: integer({ mode: "timestamp" }),
  duration_ms: integer().generatedAlwaysAs(() => sql`finished_at - started_at`),
});

export const toolHealthChecks = sqliteTable(
  "tool_health_checks",
  {
    id: text().primaryKey(),
    tool_name: text().notNull(),
    version: text(),
    status: text({ enum: ["ok", "warning", "fail"] }).notNull(),
    notes: text(),
    checked_at: integer({ mode: "timestamp" }).notNull(),
  },
  (table) => [index("idx_tool_latest").on(table.tool_name, desc(table.checked_at))],
);
