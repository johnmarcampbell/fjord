# Switch backend SQLite driver from better-sqlite3 to node:sqlite

> Replace the native `better-sqlite3` driver with Node's stdlib `node:sqlite`, via Drizzle 1.0 RC's `drizzle-orm/node-sqlite` adapter, on Node 24. Removes a native dependency, simplifies the Docker build, and aligns tests with the production engine.

## Source

- GitHub issue: [#84 — Switch from better-sqlite3 to node:sqlite (eliminate native dependency)](https://github.com/johnmarcampbell/agentic_kanban/issues/84)

## Context

The backend uses [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), a native module requiring a C/C++ toolchain to compile (or a prebuilt `.node` binary per arch). The `Dockerfile` carries `apt-get install python3 make g++` to cover environments without a usable prebuild. Node 24 ships `node:sqlite` as a stable, unflagged stdlib module; Drizzle 1.0 RC ships a matching `drizzle-orm/node-sqlite` driver. Switching eliminates the native dep and the toolchain step, at the cost of running a Drizzle release candidate and bumping the minimum Node version.

The current sqlite usage is *not* perfectly isolated to one file as the issue describes — `repairSchemaDrift`, `demo.ts`, and two test files all call `better-sqlite3`-specific APIs (`sqlite.pragma`, `sqlite.transaction`, `new Database(...)`). The migration touches all of them.

## Goals

1. The backend opens its SQLite database via `node:sqlite`'s `DatabaseSync`, exposed to Drizzle through `drizzle-orm/node-sqlite`.
2. `better-sqlite3` and `@types/better-sqlite3` are absent from `backend/package.json` and from the installed `node_modules` tree.
3. The Dockerfile no longer installs `python3 make g++`.
4. Minimum Node version is 24; engines pin, Dockerfile, README, and CLAUDE.md all reflect this.
5. The full backend test suite passes (`npm test` from root), exercising the new driver in both prod code and test fixtures.
6. Migrations under `backend/migrations/` continue to apply cleanly to a fresh and to an already-populated database.
7. `repairSchemaDrift` continues to repair drifted schemas atomically (BEGIN/COMMIT/ROLLBACK semantics preserved).

## Non-goals

1. **Switching to LibSQL / `@libsql/client`.** Discussed and rejected in [ADR-0011](../adr/0011-node-sqlite-driver.md); this plan implements the node:sqlite path only.
2. **Refactoring `repairSchemaDrift` away.** It stays; we only port its driver calls.
3. **Removing the `DBHandle.sqlite` escape hatch.** It is still needed by `demo.ts` and `repairSchemaDrift`; we retype it but don't redesign it.
4. **Bumping Node to 26 (current).** Node 24 LTS is enough; bumping further is a separate decision.
5. **Reworking the migrations folder format.** `drizzle-orm/node-sqlite/migrator` accepts the same `migrationsFolder` config as the better-sqlite3 migrator.
6. **Performance tuning.** No benchmarking is in scope. If something regresses meaningfully, file a follow-up.

## Relevant prior decisions

- [ADR-0011 — Use node:sqlite (stdlib) instead of better-sqlite3](../adr/0011-node-sqlite-driver.md) *(new, created with this plan)* — captures the driver choice, Drizzle RC pinning, Node 24 floor, rejected alternatives, and consequences. Read this before executing the plan.
- Existing ADRs in `docs/adr/` describe the domain (auth, soft-delete users, roles) and are not directly affected by this work, but `repairSchemaDrift` exists *because* of the schema additions those ADRs introduced — see [backend/src/db/index.ts:62](../../backend/src/db/index.ts:62) — so its semantics must not change.

## Relevant files and code

- [backend/src/db/index.ts](../../backend/src/db/index.ts) — driver init, `runMigrations`, `repairSchemaDrift`. The center of this change.
- [backend/src/demo.ts:20](../../backend/src/demo.ts:20) — `handle.sqlite.exec(this.seedSql)`; relies on the escape hatch.
- [backend/src/db/schema.ts](../../backend/src/db/schema.ts) — driver-agnostic, uses `drizzle-orm/sqlite-core`. **No changes expected.**
- [backend/tests/users.test.ts](../../backend/tests/users.test.ts) — fixtures using `new Database(...)`, `sqlite.exec`, `sqlite.prepare`.
- [backend/tests/migrations.test.ts](../../backend/tests/migrations.test.ts) — fixtures using `new Database(...)`, `sqlite.pragma`, `sqlite.exec`, `sqlite.prepare`.
- [backend/package.json](../../backend/package.json) — `dependencies.better-sqlite3`, `dependencies.drizzle-orm`, `devDependencies.@types/better-sqlite3`.
- [package.json:24](../../package.json:24) — `engines.node` (currently `>=22`), root `drizzle-orm` devDep.
- [Dockerfile:10-12](../../Dockerfile:10) — toolchain install; [Dockerfile:6](../../Dockerfile:6) and [Dockerfile:32](../../Dockerfile:32) — `node:22-slim` base images.
- [README.md:9](../../README.md:9) — mentions "Node 22, ..., better-sqlite3".
- [CLAUDE.md:23](../../CLAUDE.md:23) — same mention as README.

## Approach

The change is a driver swap in one file, plus a handful of mechanical edits in call sites that touch better-sqlite3-specific APIs. The schema definitions and all business logic are driver-agnostic (everything goes through Drizzle), so the blast radius is small.

In `backend/src/db/index.ts` we construct `new DatabaseSync(dbPath, { enableForeignKeyConstraints: true })`, then immediately `db.exec("PRAGMA journal_mode = WAL")` (the constructor has no journal-mode option), then hand the client to `drizzle(client, { schema })` from `drizzle-orm/node-sqlite`. The `DBHandle.sqlite` field is retyped from `Database.Database` to `DatabaseSync` and kept — `demo.ts` and `repairSchemaDrift` need a raw escape hatch for multi-statement SQL.

`repairSchemaDrift`'s `sqlite.transaction(() => { ... })()` pattern is replaced with a small shared `withTransaction(db, fn)` helper in the same file: `BEGIN`, run `fn`, `COMMIT` on success or `ROLLBACK` + rethrow on error. All `.pragma()` calls (in src and tests) become `.exec("PRAGMA ...")`. All `new Database(...)` calls (in tests) become `new DatabaseSync(...)`.

Drizzle bumps from 0.45.2 to a pinned 1.0 RC (`1.0.0-rc.4-5d5b77c` as the candidate at planning time — verify the latest stable-ish RC at execution time and pin to it). The pin is exact, not a range, because RCs ship breaking changes between builds. The `drizzle-orm` devDep in the root `package.json` must move in lockstep with the backend's `drizzle-orm` dep to keep the workspace consistent.

Node version moves from `>=22` to `>=24` in three places: root `package.json`, both Dockerfile stages (`node:24-slim`), and the README/CLAUDE.md prose. No runtime flag is needed — `node:sqlite` is stable and unflagged on Node 24.

The Drizzle migrator import path moves from `drizzle-orm/better-sqlite3/migrator` to `drizzle-orm/node-sqlite/migrator`. The migrator signature is identical (`migrate(db, { migrationsFolder })`) and reads the existing `backend/migrations` layout unchanged.

### Decision update: custom migrator instead of Drizzle's built-in

During execution, the Drizzle 1.0 RC migrator turned out to expect a new on-disk layout (`<timestamp>_<name>/migration.sql` directories) rather than the flat `<tag>.sql` files in `backend/migrations/`. Rather than reformatting all existing migrations and breaking the upgrade path from older deployments, the implementation uses a custom migrator (`applyMigrations` in `backend/src/db/index.ts`) that reads the existing flat layout and tracks applied migrations in `__ak_migrations`. On first run against a database previously migrated by Drizzle 0.45, it backfills from `__drizzle_migrations` by matching `created_at` timestamps against `meta/_journal.json`. See the doc comment on `applyMigrations` in `backend/src/db/index.ts` for details.

## Step-by-step plan

1. **Verify the chosen Drizzle 1.0 RC build.** Run `npm view drizzle-orm@1.0.0-rc.4-5d5b77c exports | grep node-sqlite` and confirm `./node-sqlite`, `./node-sqlite/driver`, `./node-sqlite/migrator` are exported. If a newer RC has shipped, prefer it; pin to an exact version, no range. Note the chosen version for use in step 6.

2. **Bump Node to 24 in `engines` and Docker.** Edit [package.json:25](../../package.json:25): change `"node": ">=22"` to `"node": ">=24"`. Edit [Dockerfile:6](../../Dockerfile:6) and [Dockerfile:32](../../Dockerfile:32): change `FROM node:22-slim` to `FROM node:24-slim` in both build and runtime stages. Verify with `docker build .` succeeds (in step 12, after code changes).

3. **Remove the C/C++ toolchain install from the Dockerfile.** Delete lines 10–12 of [Dockerfile](../../Dockerfile:10) (the `RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*` block, plus the comment above it). The build stage should now go straight from `WORKDIR /app` to the `COPY` instructions.

4. **Update prose mentions of "Node 22" / "better-sqlite3".** [README.md:9](../../README.md:9) and [CLAUDE.md:23](../../CLAUDE.md:23): change "Node 22, ..., better-sqlite3" to "Node 24, ..., node:sqlite". Grep `Node 22|better-sqlite3` to catch any other prose references; update any that remain.

5. **Rewrite `backend/src/db/index.ts` against `node:sqlite`.** Replace the file contents per this skeleton:
   - Replace `import Database from "better-sqlite3"` with `import { DatabaseSync } from "node:sqlite"`.
   - Replace the drizzle imports: `import { drizzle, type NodeSQLiteDatabase } from "drizzle-orm/node-sqlite"` and `import { migrate } from "drizzle-orm/node-sqlite/migrator"`.
   - Change `export type DB = BetterSQLite3Database<typeof schema>` to `export type DB = NodeSQLiteDatabase<typeof schema>`.
   - In `DBHandle`, change `sqlite: Database.Database` to `sqlite: DatabaseSync`.
   - In `openDatabase`: replace `const sqlite = new Database(dbPath)` with `const sqlite = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true })`. Replace `sqlite.pragma("journal_mode = WAL")` with `sqlite.exec("PRAGMA journal_mode = WAL")`. Delete the now-redundant `sqlite.pragma("foreign_keys = ON")` line (foreign keys are now on via the constructor option).
   - Pass the client into Drizzle via `drizzle(sqlite, { schema })`. The `client` form accepts a pre-constructed `DatabaseSync`, which is what we want so that pragmas can be set before any queries.
   - Replace `hasColumn`'s and `hasTable`'s `Database.Database` parameter type with `DatabaseSync`. The `.prepare(...).get()/.all()` API on `DatabaseSync` is parameter-compatible with our existing usage; cast results as needed.
   - Replace `repairSchemaDrift`'s `const repair = sqlite.transaction(() => { ... }); repair();` with a call to a new local helper: `withTransaction(sqlite, () => { ... })`.
   - Add the helper at the bottom of the file:
     ```ts
     function withTransaction(db: DatabaseSync, fn: () => void): void {
       db.exec("BEGIN");
       try {
         fn();
         db.exec("COMMIT");
       } catch (e) {
         db.exec("ROLLBACK");
         throw e;
       }
     }
     ```
   Run `npm run typecheck -w backend` and resolve any type errors before moving on.

6. **Swap the Drizzle dependency.** In [backend/package.json](../../backend/package.json):
   - Change `"drizzle-orm": "0.45.2"` in `dependencies` to the exact RC pinned in step 1 (e.g. `"drizzle-orm": "1.0.0-rc.4-5d5b77c"`).
   - Remove `"better-sqlite3": "12.10.0"` from `dependencies`.
   - Remove `"@types/better-sqlite3": "7.6.13"` from `devDependencies`.
   In [package.json (root):21](../../package.json:21): change root `devDependencies."drizzle-orm"` to the same pinned RC version.
   Run `npm install` from the repo root. Verify `node_modules/better-sqlite3` no longer exists.

7. **Migrate `backend/src/demo.ts`.** Open [backend/src/demo.ts:20](../../backend/src/demo.ts:20). The `handle.sqlite.exec(this.seedSql)` line should keep working as-is — `DatabaseSync.exec()` accepts multi-statement SQL, same as better-sqlite3. Verify no other better-sqlite3-specific calls live in this file with `grep -n 'pragma\|transaction\|Database' backend/src/demo.ts`. If anything turns up, port it.

8. **Migrate `backend/tests/users.test.ts`.** Replace `import Database from "better-sqlite3"` with `import { DatabaseSync } from "node:sqlite"`. Replace `import { drizzle } from "drizzle-orm/better-sqlite3"` with `import { drizzle } from "drizzle-orm/node-sqlite"`. Replace every `new Database(":memory:")` with `new DatabaseSync(":memory:")`. The `.exec(...)`, `.prepare(...).get()`, `.prepare(...).all()` calls in fixture code are parameter-compatible with `DatabaseSync`. Run `npm test -w backend -- users` and resolve failures.

9. **Migrate `backend/tests/migrations.test.ts`.** Same import swaps as step 8. Replace every `new Database(":memory:")` with `new DatabaseSync(":memory:")`. Replace every `sqlite.pragma("foreign_keys = ON")` with `sqlite.exec("PRAGMA foreign_keys = ON")` — or, where the test constructs its own sqlite handle, pass `{ enableForeignKeyConstraints: true }` to `DatabaseSync` and drop the pragma line. The `sqlite.exec`, `sqlite.prepare` calls stay as-is. Run `npm test -w backend -- migrations` and resolve failures.

10. **Sweep for any straggling better-sqlite3 references.** Run `grep -rn 'better-sqlite3\|BetterSQLite3' backend/ shared/ frontend/ package.json` — expect zero matches. If any turn up, port them.

11. **Run the full test suite and typecheck.** From the repo root: `npm test` (builds shared, then runs backend tests), `npm run typecheck -w backend`, `npm run typecheck -w frontend`. All must pass clean.

12. **Verify the Docker build.** From the repo root: `docker build -t agentic-kanban .`. Confirm: (a) the build succeeds without the toolchain install step; (b) the resulting image runs `docker run -p 3000:3000 -v $(pwd)/data-test:/data agentic-kanban` and `GET http://localhost:3000/api/health` returns 200. Tear down the test container and data dir afterwards.

13. **Verify the existing-database upgrade path.** This is the riskiest scenario: an older volume with a pre-existing `kanban.db` containing pre-`repairSchemaDrift` schema. Construct a representative old-shape DB (or copy one from a running deployment if available) and start the backend against it; confirm `repairSchemaDrift` applies cleanly and queries succeed against the repaired schema. If no realistic old DB is available, at minimum re-run the existing `migrations.test.ts` cases that exercise the drift path against the new driver (covered in step 9, but call this out explicitly here as a verification gate).

14. **Run the dev server end-to-end.** From repo root: `npm run dev`. In the browser, log in as `default-administrator`, create a task, drag it through columns, add a comment, refresh. Confirm SSE stream reconnects on page load and updates propagate. This catches any startup ordering issue (WAL pragma must run before any query) that unit tests might miss.

## Demo seed data

No new tables, columns, or entities are introduced by this plan — it is a pure infrastructure swap. `backend/demo/seed.sql` does **not** need changes.

The seed file *is* exercised by this plan transitively (via [backend/src/demo.ts:20](../../backend/src/demo.ts:20) which uses the retyped escape hatch), so the dev-server smoke test in step 14 should be run in demo mode at least once: `npm run demo` from the repo root, then load the app and verify the seeded board renders. This is a regression check on the seed loader, not a seed change.

## Testing strategy

- **Unit / integration tests (Vitest, `backend/tests/`):**
  - [users.test.ts](../../backend/tests/users.test.ts) — must pass after step 8's fixture migration. Covers handle/avatar backfill behaviour.
  - [migrations.test.ts](../../backend/tests/migrations.test.ts) — must pass after step 9. Covers `repairSchemaDrift` and migration application across various pre-existing schema states; this is the most load-bearing test file for the change.
  - All other test files (`auth`, `tasks`, `spaces`, `cycles`, `journal`, `passwords`, `policy`, `shared-identity`, `config`) — must continue to pass. They go through `buildApp()` and the production `openDatabase` code path, so they exercise the new driver end-to-end without code changes of their own.

- **Manual checks (no component tests for frontend):**
  - Dev server smoke test in step 14.
  - Demo-mode smoke test (`npm run demo`) — confirms `demo.ts`'s use of `handle.sqlite.exec(seedSql)` still works.
  - Docker build and run in step 12 — confirms the production launch path.

- **Regression risk:**
  - **WAL pragma timing** — `journal_mode = WAL` must be set before any query runs, including before Drizzle starts issuing reads through its prepared-statement cache. Verify by checking that the DB file's `-wal` companion file appears after a write (`ls data/kanban.db*` after a task create).
  - **Foreign keys** — `enableForeignKeyConstraints: true` must actually be honoured. Spot-check by deleting a user and confirming their sessions are cascaded (existing `auth` tests cover this).
  - **Transaction rollback** — `withTransaction` must rollback on error. Force an error inside `repairSchemaDrift` (temporarily, in a scratch branch) and confirm the partial repair is rolled back. Not a permanent test; just one-time verification during execution.

## Acceptance criteria

- [ ] `backend/package.json` contains no `better-sqlite3` or `@types/better-sqlite3` entry.
- [ ] `node_modules/better-sqlite3` does not exist after a clean `npm install`.
- [ ] `backend/src/db/index.ts` imports from `node:sqlite` and `drizzle-orm/node-sqlite`.
- [ ] `Dockerfile` contains no `apt-get install python3 make g++` line.
- [ ] `Dockerfile` uses `node:24-slim` in both build and runtime stages.
- [ ] `engines.node` in root `package.json` is `>=24`.
- [ ] `README.md` and `CLAUDE.md` mention Node 24 and `node:sqlite` (not Node 22 / better-sqlite3).
- [ ] `npm test` from repo root passes (builds shared, runs backend tests).
- [ ] `npm run typecheck` clean in both `backend/` and `frontend/`.
- [ ] `docker build -t agentic-kanban .` succeeds.
- [ ] `docker run` of the built image serves `GET /api/health` returning 200.
- [ ] Demo mode (`npm run demo`) loads the seeded board successfully.
- [ ] Manual dev-server walkthrough (login, create task, drag, comment, refresh) completes without errors.
- [ ] `repairSchemaDrift` still applies atomically — verified by running `migrations.test.ts` against the new driver.
- [ ] `docs/adr/0011-node-sqlite-driver.md` is committed (it was created during planning).

## Open questions

None — all design decisions resolved during grilling. One execution-time check remains: confirm at step 1 that no newer Drizzle 1.0 RC has shipped that would be a better pin target, and if so, use it instead.

## Out-of-band work

- When Drizzle 1.0 **stable** lands, file a follow-up to swap the RC pin for the stable version. The change should be a one-line edit to two `package.json` files plus a re-run of the test suite.
- Existing deployments with persistent `kanban.db` volumes will continue to work via `repairSchemaDrift`; no data migration is required. Anyone deploying from an old Node 22 base image will need to rebuild against `node:24-slim` — communicate this in the release notes for the change.
