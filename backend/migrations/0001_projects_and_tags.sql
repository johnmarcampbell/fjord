CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`color` text NOT NULL DEFAULT '#6366f1',
	`description` text NOT NULL DEFAULT '',
	`due_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `project_id` text;
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `tags` text NOT NULL DEFAULT '[]';
