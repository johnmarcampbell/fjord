-- Allow editing and deleting comments and journal entries (issue #94)
-- Adds updated_at to task_events to track edits.

ALTER TABLE `task_events` ADD `updated_at` text;
