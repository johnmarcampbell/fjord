ALTER TABLE `task_events` ADD `by_assignee` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `task_events_kind_idx` ON `task_events` (`task_id`,`kind`);