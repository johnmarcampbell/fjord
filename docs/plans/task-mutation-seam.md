# Task-mutation seam: atomic writes, publish-after-commit

> **Status: implemented** (2026-06-11). One deviation from §1 below: drizzle's
> native synchronous `db.transaction()` (implemented by the node-sqlite
> driver's `NodeSQLiteSession`, with savepoint nesting) turned out to cover
> the need, so `withTransaction` was not promoted — `runTaskMutation` calls
> `ctx.db.transaction()` directly and no `db/index.ts` change was required.
> Invariant tests live in `backend/tests/task_mutation_seam.test.ts`.

Self-contained implementation plan. A fresh agent with no prior context should
be able to execute this end to end. Vocabulary: see **Task mutation**,
**Stream event**, and **Task event** in [CONTEXT.md](../../CONTEXT.md) — this
plan implements the "Task mutation" guarantee described there.

## Problem

Every task write in `backend/src/services/tasks.ts` hand-rolls the same
sequence: fetch task → validate (version, space writeability, assignee access,
blocker cycles) → write task row → insert `task_events` row(s) → publish to
the in-memory `EventBus`. There are ~10 such entry points and **zero
transactions** anywhere in the service layer:

`createTask` (l.307), `updateTask` (l.451), `deleteTask` (l.499),
`addComment`/`addJournalEntry` (via `addTimelineEntry`, l.510),
`addBlocker` (l.557), `removeBlocker` (l.597),
`archiveTask`/`unarchiveTask` (via `setArchived`, l.643),
`editTaskEvent` (l.724), `deleteTaskEvent` (l.746).

Two defects follow:

1. **No crash-consistency.** A process death between the task-row write and
   the event insert leaves a task whose timeline is silently missing an entry
   (or, for `createTask`, a task with no `task_created` event). node:sqlite is
   synchronous and single-process, so there is no *interleaving* risk today —
   the bug class is crash mid-sequence, plus any future async refactor.
2. **Publish-before-durable.** `events.publish(...)` fires mid-function. If a
   later statement in the same mutation throws, SSE clients have been told
   about state that never committed. The invariant "a Task mutation always
   records its Task events" is convention re-asserted by copy-paste, not a
   guarantee.

## Settled design (do not re-litigate)

These decisions came out of a grilling session; the rationale is recorded so
they aren't reopened casually.

1. **Transactional wrapper, not an intent engine.** Keep the ten mutation
   functions conceptually as they are. Each runs inside a private
   `runTaskMutation(...)` that owns BEGIN/COMMIT/ROLLBACK. No declarative
   intent restructure.
2. **Mutations return their Stream events; the wrapper publishes after
   COMMIT.** `EventBus` disappears from the mutation bodies. On rollback,
   nothing is published. This makes publish-after-commit impossible to get
   wrong rather than a convention.
3. **The service entry points wrap themselves** (not the routes). The exported
   functions contain the guarantee; there is no exported unguarded write for a
   future caller to reach for. Routes stay thin.
4. **All ten entry points go through the seam**, including the single-write
   ones (`deleteTask`, `editTaskEvent`, `deleteTaskEvent`) where the
   transaction adds nothing today — uniformity means a reader never asks "is
   this one of the wrapped ones?", and publish-after-commit applies to all.
5. **Scope: Task mutations only.** Space/Project/User services are untouched.
   The N+1 in `hydrateTask` and the route error-mapping consolidation are
   separate efforts.
6. **Naming:** the concept is "Task mutation" (already added to CONTEXT.md).
   Code stays in `services/tasks.ts`; no file split.

## Implementation

### 1. Promote `withTransaction` (backend/src/db/index.ts)

A private `withTransaction(db: DatabaseSync, fn: () => void)` already exists
at l.258 (BEGIN/COMMIT/ROLLBACK; used by the migrator and schema repair).
Routes only see the Drizzle handle (`app.db`), not the raw `DatabaseSync`.

Export a Drizzle-typed variant from `db/index.ts`:

```ts
export function withTransaction<T>(db: DB, fn: () => T): T {
  db.$client.exec("BEGIN");
  try {
    const out = fn();
    db.$client.exec("COMMIT");
    return out;
  } catch (e) {
    db.$client.exec("ROLLBACK");
    throw e;
  }
}
```

Check how the Drizzle node-sqlite handle exposes its client (`db.$client` in
1.0 RC; if absent, thread `DBHandle.sqlite` instead — `buildApp` already has
the full `DBHandle`, so decorating `app.sqlite` is an acceptable fallback).
Keep the existing `DatabaseSync`-typed private helper for the migrator, or
unify — implementer's choice. **No nesting support**: document on the export
that nested calls throw (SQLite errors on BEGIN-inside-BEGIN); no mutation
calls another today.

### 2. The seam (backend/src/services/tasks.ts)

```ts
export interface TaskCtx {
  db: DB;
  bus: EventBus;
}

/** Run a Task mutation: guards + writes inside one transaction; Stream
 * events collected during the body are published only after COMMIT. */
function runTaskMutation<T>(
  ctx: TaskCtx,
  fn: (publish: (e: StreamEvent) => void) => T,
): T {
  const pending: StreamEvent[] = [];
  const result = withTransaction(ctx.db, () => fn((e) => pending.push(e)));
  for (const e of pending) ctx.bus.publish(e);
  return result;
}
```

`runTaskMutation` is **not exported**.

### 3. Convert the ten entry points

Signature change, applied uniformly:

```ts
// before
export function updateTask(db: DB, events: EventBus, actor: string, id: string, body: UpdateTaskRequest): Task
// after
export function updateTask(ctx: TaskCtx, actor: string, id: string, body: UpdateTaskRequest): Task
```

Body pattern (using `updateTask` as the example):

```ts
export function updateTask(ctx, actor, id, body): Task {
  return runTaskMutation(ctx, (publish) => {
    const db = ctx.db;
    // ...existing guard/write/event logic, verbatim...
    publish({ type: "task.updated", task_id: id, version: updates.version, space_id: target.spaceId });
    return hydrateTask(db, { ...existing, ...updates });
  });
}
```

Notes per function:

- `addBlocker` and `setArchived` publish **two** Stream events each — both go
  through `publish(...)`; order preserved.
- `editTaskEvent`/`deleteTaskEvent` take `editWindowMinutes` as an extra arg —
  unchanged; only `(db, bus, ...)` → `(ctx, ...)`.
- `hydrateTask` calls inside mutation bodies run **inside** the transaction
  (fine — reads of just-written rows).
- Pure helpers (`buildTaskEvent`, `wouldCreateCycle`, `columnHeadPosition`,
  etc.) keep their `(db, ...)` signatures; they are not entry points.
- `requires`: import `StreamEvent` from `@fjord/shared`.

### 4. Route call sites (backend/src/routes/tasks.ts)

Mechanical: every `updateTask(app.db, app.events, actor.id, ...)` becomes
`updateTask({ db: app.db, bus: app.events }, actor.id, ...)`. A small
`const ctx = { db: app.db, bus: app.events }` at the top of `tasksRoutes` (or
per-handler) keeps it tidy. ~15 call sites, all in this one file. Grep the
whole backend for other importers of the mutation functions (tests import
several helpers; only entry-point callers need the ctx change).

### 5. Tests (backend/tests/)

Existing suite: HTTP-level via `app.inject()`; it must pass unchanged — the
HTTP interface does not move.

New file `backend/tests/task_mutation_seam.test.ts`, exercising the seam
directly (in-memory DB via the existing helpers, a real `EventBus`, no
Fastify):

1. **Publish only after commit:** subscribe a listener; call `updateTask` with
   a stale `version` (throws `VersionConflictError`); assert the listener saw
   nothing. Repeat with a guard that fails *after* earlier writes would have
   happened in the old code — e.g. `updateTask` moving a task to a space its
   assignee can't access (`AssigneeNoAccessError`).
2. **Rollback leaves nothing:** force a throw mid-body (the cleanest lever:
   `addBlocker` with a `blocker_id` that creates a cycle happens before
   writes; better: call `updateTask` where `resolveTargetSpace` throws
   `SpaceProjectMismatchError`, then assert the task row's `version` and
   `updatedAt` are unchanged and no new `task_events` rows exist).
   If no existing guard fires after a write, add a test-only failure injection
   by passing an invalid value that the DB layer rejects (e.g. violating a
   NOT NULL via a crafted call) — or accept guard-level coverage and assert
   the row/event counts are coherent after each successful mutation
   (`task_created` exists for every created task, etc.).
3. **Happy path equivalence:** one mutation of each kind succeeds and
   publishes exactly the events the old code published (count + types + order).

Run: `npm test` from the repo root (builds shared, runs backend vitest).

### 6. Documentation

- CLAUDE.md "Services" bullet for `services/tasks.ts`: mention that all task
  writes are Task mutations (transactional, publish-after-commit).
- No new ADR required — this implements existing intent rather than reversing
  a recorded decision. (ADR-0011 already anticipated `withTransaction` being
  used "anywhere else atomicity is required.")

## Acceptance criteria

- [ ] Zero `events.publish` / `bus.publish` calls inside transaction bodies in
      `services/tasks.ts`; all publishes flow through `runTaskMutation`.
- [ ] All ten entry points take `TaskCtx` and run inside the wrapper.
- [ ] `EventBus` no longer appears in any mutation function body.
- [ ] Full existing test suite green, unchanged.
- [ ] New seam tests cover publish-after-commit and rollback-leaves-nothing.
- [ ] `npm run typecheck` clean in `backend/`.

## Out of scope (tracked separately)

- Generalizing `runTaskMutation` and routing `moveProjectToSpace`
  (`backend/src/services/spaces.ts`) through it — that path updates task
  rows, inserts `space_changed` task events, and publishes `task.updated`,
  hand-rolling the same transaction + publish-after-commit idiom the seam
  exists to own. The wrapper has nothing task-specific in it; generalize it
  the next time the spaces service is touched. (Review follow-up from
  PR #148.)
- Batch `hydrateTask` (N+1 on `GET /api/tasks`) — candidate #4 from the
  architecture review.
- Unifying route error mapping (`mapServiceError` + `routes/errors.ts`) —
  candidate #5.
- Space-access policy consolidation — candidate #2.
