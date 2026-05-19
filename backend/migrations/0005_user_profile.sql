ALTER TABLE `users` ADD COLUMN `handle` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `title` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `bio` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `avatar` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `token_hash` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_lower_unique` ON `users` (lower(`handle`));
