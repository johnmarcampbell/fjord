# User-profile backfill runs in application code, not in migration SQL

The migration that adds `handle` and `avatar` to `users` needs to backfill
existing rows: slugify each user's `display_name` (with collision suffix) and
pick a deterministic emoji. Doing that in pure SQLite SQL is awkward — SQLite
has no native slugify, and the collision-suffix loop is ugly via UPDATE. We
instead keep the migration purely declarative (ALTER TABLE + unique index) and
run a `backfillUserProfiles()` function in application startup after migrations
and seeding/reset. It's idempotent (only touches rows with NULL `handle` or
`avatar`), shares the same `slugify` and `pickAvatar` helpers used by POST/PATCH,
and is unit-testable.
