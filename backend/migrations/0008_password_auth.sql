-- Password authentication (issue #80)
-- Adds password_hash to users, drops token_hash, adds sessions and api_tokens.

ALTER TABLE `users` DROP COLUMN `token_hash`;--> statement-breakpoint
ALTER TABLE `users` ADD `password_hash` text;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `api_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`lookup_hash` text NOT NULL,
	`token_hash` text NOT NULL,
	`preview` text NOT NULL,
	`created_at` text NOT NULL,
	`last_used_at` text,
	`expires_at` text,
	`revoked_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `api_tokens_lookup_hash_unique` ON `api_tokens` (`lookup_hash`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `api_tokens_user_idx` ON `api_tokens` (`user_id`);
