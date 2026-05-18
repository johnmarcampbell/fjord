CREATE TABLE `spaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived_at` text
);
--> statement-breakpoint
INSERT INTO `spaces` (`id`, `name`, `description`, `created_at`, `updated_at`)
	VALUES ('default', 'Default', '',
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
		strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `space_id` text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `space_id` text DEFAULT 'default' NOT NULL;
--> statement-breakpoint
CREATE INDEX `projects_space_idx` ON `projects` (`space_id`);
--> statement-breakpoint
CREATE INDEX `tasks_space_idx` ON `tasks` (`space_id`);
