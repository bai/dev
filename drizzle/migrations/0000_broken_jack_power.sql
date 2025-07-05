CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`cli_version` text NOT NULL,
	`command_name` text NOT NULL,
	`arguments` text,
	`exit_code` integer,
	`cwd` text NOT NULL,
	`error_tag` text,
	`error_reason` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`duration_ms` integer GENERATED ALWAYS AS (finished_at - started_at) VIRTUAL
);
--> statement-breakpoint
CREATE TABLE `tool_health_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`tool_name` text NOT NULL,
	`version` text,
	`status` text NOT NULL,
	`notes` text,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_tool_latest` ON `tool_health_checks` (`tool_name`,"checked_at" desc);