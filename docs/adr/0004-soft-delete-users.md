# Users are soft-deleted

The repo's stated rule is "no soft deletes — hard deletes only" (see CLAUDE.md
key constraints). Users are the exception.

A user's identity is referenced by `tasks.reported_by`, `tasks.assigned_to`,
`task_events.actor_id`, and every comment/journal entry, all with foreign keys
to `users.id`. The original `DELETE /api/users/:id` route documented these
references as "stale after delete," but the schema enforced them — so the very
first attempt to self-delete a user who had ever created a task or authored
an event tripped a `FOREIGN KEY constraint failed` error. We considered three
fixes: rebuild the tables to drop the FKs, cascade-delete the user's history,
or reject the delete when references exist. All three sacrifice something
important — referential integrity, audit history, or the ability to ever
self-delete.

Soft delete keeps all three. The row stays in `users`, all foreign keys
remain valid, historical comments and events still attribute correctly, and
the only behavioural change is that selection UIs (`UsersPage`,
`FilterBar`, the `TaskDrawer` assignee picker) filter out users where
`deleted_at` is set. The schema gains a single nullable `deleted_at` column
on `users`; `DELETE /api/users/:id` becomes an idempotent
`UPDATE users SET deleted_at = now(), password_hash = NULL WHERE id = ?`
plus a follow-on `DELETE FROM sessions WHERE user_id = ?`
(see [ADR-0008](0008-password-authentication.md)).

The credential state (password and sessions) is wiped on delete so a
soft-deleted user cannot keep authenticating. Any API token rows the user
still owns stay in the `api_tokens` table for audit, but they no longer
authenticate either: the actor resolver loads the bound user and rejects
anyone with `deleted_at` set.

The handle remains reserved. The unique index on `lower(handle)` already
covers this because the row stays; a future user cannot grab `@alice` after
the original alice is deleted. This is the right default — past attribution
("@alice commented") keeps pointing to the same person — and it leaves the
door open for an undelete endpoint without a rename dance. Reusing handles
later would require a deliberate rename-on-delete step we have not built.

Restore is not exposed in the UI yet. The data shape supports it
(`UPDATE users SET deleted_at = NULL`) but no endpoint is wired up; once we
need it (likely alongside admin tooling in #60) it is a small follow-up.

`PATCH /api/users/:id` returns 404 for a soft-deleted user, so the edit path
treats them as if they no longer exist. Read endpoints (`GET /api/users`,
`GET /api/users/:id`) continue to return deleted rows with `deleted_at`
populated so clients can render attribution.
