# Use node:sqlite (stdlib) instead of better-sqlite3

The backend originally used [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3)
as its SQLite driver. It works well, but it is a **native module** — a C/C++
binding that must be compiled (or downloaded as a prebuilt `.node`) for each
target architecture. The `Dockerfile` carried `python3 make g++` as a
fallback toolchain for environments where the prebuild was unavailable, and
the dependency tree included `@types/better-sqlite3` to match.

Node 24 (LTS, released April 2025) ships its own SQLite binding in core
(`node:sqlite`) as a stable, unflagged module. Drizzle ORM gained a
matching `drizzle-orm/node-sqlite` driver in its 1.0 release-candidate
line.

## Decision

The backend uses **`node:sqlite`** as its SQLite driver, with **Drizzle 1.0
RC**'s `drizzle-orm/node-sqlite` adapter. Minimum Node version is **24**
(engines `>=24`, Docker base image `node:24-slim`). `better-sqlite3` and
`@types/better-sqlite3` are removed from `backend/package.json`. The build
stage no longer installs a C/C++ toolchain.

### node:sqlite API differences

`node:sqlite`'s `DatabaseSync` is API-close to `better-sqlite3` but
intentionally smaller. Two helpers we relied on do not exist and are
replaced inline:

- **`.pragma(...)`** → `db.exec("PRAGMA ...")`. `foreign_keys` is set via
  the constructor option `enableForeignKeyConstraints: true`. WAL is
  enabled by an explicit `exec("PRAGMA journal_mode = WAL")` immediately
  after construction, before any queries.
- **`.transaction(fn)`** → a small `withTransaction(db, fn)` helper in
  `backend/src/db/index.ts` that wraps a function in `BEGIN` / `COMMIT` /
  `ROLLBACK`. Used by `repairSchemaDrift` and anywhere else atomicity is
  required.

The `DBHandle.sqlite` escape hatch is preserved but retyped from
`better-sqlite3`'s `Database.Database` to `node:sqlite`'s `DatabaseSync`.
It is still used by `demo.ts` to bulk-load the seed SQL and by the
schema-drift repair path.

### Drizzle 1.0 RC pinning

Drizzle's `node-sqlite` driver is only available in the 1.0 RC line. The
dependency is pinned to a specific RC build (e.g. `1.0.0-rc.4-5d5b77c`)
rather than a floating range. When Drizzle 1.0 stable ships, the pin
will be updated; until then, RC version bumps are an explicit reviewable
change rather than a silent `npm install` drift.

### Custom migrator

Drizzle 1.0 RC changed the on-disk migration layout (now one
`<timestamp>_<name>/migration.sql` per migration, no `meta/_journal.json`)
*and* the runtime tracking table. To avoid reformatting every existing
migration and avoid coordinated upgrades for deployments that already have
`__drizzle_migrations` populated, the backend now applies migrations through
a small custom migrator in `backend/src/db/index.ts`:

- Reads `*.sql` files from `backend/migrations/` directly.
- Tracks applied tags in `__fjord_migrations(tag TEXT PRIMARY KEY, applied_at TEXT)`.
- On the first run against a database previously migrated by Drizzle 0.45,
  backfills `__fjord_migrations` from `__drizzle_migrations` by matching
  `created_at` against the legacy `meta/_journal.json` entries.

Drizzle is still the runtime ORM; only the migrator was replaced. If
Drizzle 1.0 stable ever ships with a backwards-compatible migrator we can
revisit, but the custom path is small and self-contained.

## Rejected alternatives

- **Stay on better-sqlite3.** Cheapest option, but indefinitely preserves
  the native-module footprint and the Docker toolchain step. The whole
  reason this ADR exists is that this footprint is the rough edge worth
  paying to remove.

- **`@libsql/client` (Turso's fork).** Has first-class Drizzle support
  with reliable prebuilds across more platforms than better-sqlite3.
  Would eliminate the *toolchain requirement* (prebuilds always work for
  our platform set) without eliminating the native-module concept. Adds
  a corporate-sponsored dependency with its own roadmap rather than a
  stdlib module. Acceptable fallback if `node:sqlite` had been missing a
  capability we needed, but it isn't.

- **`drizzle-orm/sqlite-proxy` on Drizzle 0.45.x.** Stay on stable
  Drizzle; wrap `node:sqlite` ourselves through Drizzle's generic proxy
  interface. We would own ~30 lines of adapter code, lose Drizzle's
  prepared-statement cache, and end up writing custom migrator handling.
  This trades RC risk for code we'd delete the moment we adopted the
  official driver — not a real win.

- **Defer until Drizzle 1.0 stable lands.** Keeps everything on stable
  releases. Indefinitely defers the work this ADR set out to do, with no
  visibility on the stable-release timeline.

- **Node 22 with `--experimental-sqlite`.** Avoids bumping the Node
  major. Requires `--experimental-sqlite` on every entry point (`node`,
  `tsx`, `vitest`) and accepts the risk of behaviour changes when the
  flag is removed. The cost of bumping to Node 24 is three one-line
  edits; the cost of carrying the flag is permanent.

- **Node 26 (current).** Forward-looking but non-LTS until October 2026.
  `node:sqlite` is already stable in Node 24 — there is nothing to gain
  for this migration by going further.

## Consequences

- **Build simplification.** `Dockerfile` drops the `apt-get install
  python3 make g++` step. The build stage installs node_modules without
  needing to compile native code.
- **Engine pin tightens.** `engines.node` moves from `>=22` to `>=24`.
  Anyone running an older Node will fail loudly at `npm install`.
- **Drizzle is on an RC.** A future RC bump may surface a breaking
  change. The pin to a specific RC build prevents accidental drift; the
  cost is occasional intentional bumps.
- **Tests share the production driver.** All test fixtures that used
  `new Database(...)` directly (`backend/tests/users.test.ts`,
  `backend/tests/migrations.test.ts`) now construct
  `new DatabaseSync(...)`. Production and tests exercise the same engine.
