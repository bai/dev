CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`cli_version` text NOT NULL,
	`command_name` text NOT NULL,
	`arguments` text,
	`flags` text,
	`exit_code` integer,
	`cwd` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`duration_ms` integer GENERATED ALWAYS AS (finished_at - started_at) VIRTUAL,
	`created_at` integer DEFAULT CURRENT_TIMESTAMP NOT NULL
);
