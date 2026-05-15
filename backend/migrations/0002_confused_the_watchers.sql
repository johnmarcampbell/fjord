ALTER TABLE `tasks` ADD COLUMN `archived` integer DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN `archived_at` text;
