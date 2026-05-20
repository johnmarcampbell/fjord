CREATE TABLE `user_space_access` (
	`user_id` text NOT NULL,
	`space_id` text NOT NULL,
	`granted_at` text NOT NULL,
	`granted_by` text NOT NULL,
	PRIMARY KEY(`user_id`, `space_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_space_access_user_idx` ON `user_space_access` (`user_id`);--> statement-breakpoint
-- SQLite restricts: REFERENCES in ALTER TABLE ADD COLUMN requires NULL default when FK enforcement is ON.
-- The FK is enforced by Drizzle's schema on new writes. Existing rows get the default value below.
ALTER TABLE `spaces` ADD `created_by` text DEFAULT 'default-administrator' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `role` text DEFAULT 'Member' NOT NULL;
--> statement-breakpoint
-- Backfill: existing users had de-facto admin powers, so promote them all to Admin.
-- New users default to Member (handled by the column default above).
UPDATE `users` SET `role` = 'Admin';