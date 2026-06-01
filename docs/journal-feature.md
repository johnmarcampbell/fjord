# Task journal — design

> **Historical note (issue #80):** this doc predates per-user authentication
> and references the old `X-User-Id` header throughout. The journal feature
> as shipped is unchanged in spirit, but the actual auth header on the wire
> is now an `fjord_session` cookie (humans) or `Authorization: Bearer fjord_...`
> (agents). See [ADR-0008](adr/0008-password-authentication.md).

A per-task append-only journal of free-form working notes, intended primarily for the assignee (human or agent) to record what they've tried, what worked, what didn't, and what they plan to try next. Agents restart often and lose context; the journal is the durable record of work-in-progress that lets a fresh agent (or a returning human) catch up without rediscovering everything.

## Goals

- Give agents a place to "talk to their future self" so context survives restarts.
- Distinguish working notes (intra-actor reflection) from comments (inter-actor communication).
- Keep the implementation minimal — reuse the existing `task_events` table and SSE plumbing.
- Make the journal discoverable from the board, not buried in a drawer tab.

## Non-goals

- No structured fields (decisions / attempts / files / outputs as separate columns). Free-form markdown only.
- No edit or delete of journal entries. Append-only.
- No mutable summary field, no checkpoint flag, no pagination. Defer until real usage shows a need.
- No per-actor scoping or assignee-only enforcement. One shared journal stream per task.
- No artifact / file-attachment system.

## Semantic distinction

- **Comment** — communication between actors (e.g. "@alice, ready for review"). Anyone, addressed to others.
- **Journal entry** — an actor's working notes. Primarily the assignee. The audience is the next person (often the same agent after a restart) who picks up the task.

The distinction is a soft convention: the backend does not enforce who may write what. The UI signals the convention visually.

## Data model

### Schema changes

Extend `EventKind` in `shared/src/index.ts`:

```ts
export type EventKind =
  | "comment"
  | "journal_entry"           // NEW
  | "task_created"
  | "column_changed"
  | "assigned_to_changed"
  | "reported_by_changed"
  | "due_date_changed"
  | "blocker_added"
  | "blocker_removed"
  | "project_changed"
  | "tags_changed"
  | "task_archived"
  | "task_unarchived";
```

Add one column to `task_events` (`backend/src/db/schema.ts`):

```ts
byAssignee: integer("by_assignee", { mode: "boolean" }).notNull().default(false),
```

`by_assignee` is computed at insert time (`actor_id === task.assigned_to`) and frozen with the row. It controls UI rendering (full-weight vs side-note dim) but is meaningful only for `journal_entry` rows; for other kinds it remains `false` and is ignored. No backfill of existing rows.

Migration: a new file under `backend/migrations/` adding the column.

### Why reuse `task_events`

- Existing append-only semantics match the journal model.
- SSE plumbing (`task.event_added`) already broadcasts new rows.
- Single timeline query supports the interleaved UI.
- No new table, no new SSE event type.

## API

### New endpoint

```
POST /api/tasks/:id/journal
Headers: X-User-Id: <actor>
Body:    { body: string }    // markdown
Returns: 201 { event: TaskEvent }
```

Inserts a `task_events` row with `kind = "journal_entry"`, sets `by_assignee` from the current task assignment, emits SSE `task.event_added`. Symmetric with the existing `POST /api/tasks/:id/comments`.

OpenAPI description (drives agent discoverability):

> Append a journal entry — durable working notes for this task. The journal is the assignee's working memory: record what you've tried, what worked, what didn't, and what you plan to try next.
>
> Before starting work on a task, fetch `GET /api/tasks/{id}/events?kind=journal_entry` and read prior entries. Then post a fresh entry summarizing the current state and your plan.
>
> Use comments (`POST /api/tasks/{id}/comments`) for talking to other actors. Use the journal for talking to your future self.

### Extended endpoints

```
GET /api/tasks/:id/events?kind=journal_entry
GET /api/tasks/:id/events?kind=journal_entry,comment
```

Accepts a CSV list of `EventKind` values. Unfiltered call (the current default) is unchanged. OpenAPI description recommends `?kind=journal_entry` for agent catch-up to save tokens.

```
GET /api/tasks
```

Response payload gains two integer fields per task:

- `comment_count` — number of `task_events` rows with `kind = "comment"`
- `journal_count` — number of `task_events` rows with `kind = "journal_entry"`

Computed inline via `LEFT JOIN task_events … GROUP BY t.id` with `SUM(CASE WHEN kind = … THEN 1 ELSE 0 END)`. The existing `task_events_task_idx` index makes this cheap at the scale this app targets. No denormalized counters, no write-path changes.

### SSE

Extend `StreamEvent` in `shared/src/index.ts`:

```ts
| { type: "task.event_added"; task_id: string; event_id: string; kind: EventKind }
```

Adding `kind` lets the frontend invalidate targeted query caches and bump card badges optimistically without a full refetch. Existing consumers that ignore `kind` keep working.

## Frontend

### TaskDrawer

The existing event timeline stays a single chronological list. Add filter chips at the top:

```
[All ✓] [Comments] [Journal] [System]
```

`System` covers all the existing system-event kinds (column changes, blocker adds, etc.). The filter is local UI state — no URL parameter, no persistence across drawer opens. Default is `All`.

Two composer surfaces at the bottom of the drawer:

```
[ Add comment ]            [ Add journal entry ]
```

Comment composer on the left (primary; matches existing layout). Journal composer on the right with a distinct color/icon. Both are markdown text areas.

### Rendering

Journal entries render with a gutter mark (📓) and slightly different background tint to set them apart from comments (💬) and system events.

Non-assignee journal entries (where `by_assignee === false`) render dimmed with a `· side note from {actor}` label. This is the soft signal that the journal "belongs to" the assignee; everyone else's entries are visibly secondary.

Edge cases the `by_assignee`-at-write-time approach handles cleanly:
- **Unassigned tasks** — `assigned_to === null` at write time, so every entry has `by_assignee = false` and renders as a side note. Acceptable: there is no primary voice on an unassigned task.
- **Reassignment** — the former assignee's entries stay full-weight forever (their `by_assignee` is frozen as `true`). The new assignee's entries start full-weight from the moment of reassignment.

### TaskCard

Add badges to the card footer:

```
💬 2   📓 8
```

Counts come from the extended `GET /api/tasks` payload. Hide a badge if its count is zero. Tooltip on hover names the count.

### SSE handling

The frontend's stream handler (`frontend/src/lib/stream.ts`) reads `kind` from `task.event_added`. For now: invalidate the task's events query and the tasks list query on any event (today's behavior). The `kind` field is available for future targeted invalidation without another schema change.

### Empty state

When the `Journal` filter is selected and the task has no journal entries:

> No journal entries yet. Agents and assignees use this space to record what they've tried and what's next.

## Implementation order

1. **shared/** — add `"journal_entry"` to `EventKind`; add `kind` to `StreamEvent.task.event_added`.
2. **backend/db** — add `by_assignee` column to `task_events`; generate migration via `drizzle-kit generate`.
3. **backend/services/tasks.ts** — when inserting a `task_events` row, compute `by_assignee` from the task's current `assigned_to`. (Only journal entries care, but it's harmless to set it for all rows.)
4. **backend/routes/tasks.ts** — add `POST /api/tasks/:id/journal`. Extend `GET /api/tasks/:id/events` to accept `?kind=` (CSV). Extend `GET /api/tasks` to return `comment_count` and `journal_count`. Extend the SSE emitter to include `kind`.
5. **backend OpenAPI** — write the rich description for the journal endpoint and update the events endpoint description to mention the `?kind=` filter.
6. **backend tests** — add `journal.test.ts`: post journal entry, list with filter, by_assignee correctness on assigned / unassigned / reassigned tasks, count fields on `GET /api/tasks`.
7. **frontend/lib/api.ts** — `addJournalEntry(taskId, body)`; extend events fetch to take optional `kind` filter; types updated from shared.
8. **frontend/components/TaskDrawer** — filter chips, second composer, journal-entry rendering with `by_assignee` dimming.
9. **frontend/components/TaskCard** — `📓 N` badge alongside (new) `💬 N` badge.
10. **Manual verification** — start dev server, exercise: create journal entry as assignee, as non-assignee, on unassigned task, reassign a task and verify earlier entries stay full-weight, confirm card badges update via SSE.

## Validation / safety rails

- Validate `body.length` ≤ 100_000 on the journal endpoint (matches whatever the comment endpoint enforces; cap is for sanity, not business rule).
- Existing rate-limiting / auth (the `X-User-Id` header) applies; the trusted-gateway assumption stands.
- Cascade: `task_events.task_id` already has `onDelete: cascade`, so deleting a task removes its journal entries. No special handling needed.

## Deferred — revisit when

| Trigger | Possible response |
|---|---|
| Single task crosses ~50 journal entries in practice | Introduce checkpoint flag or summary mechanism |
| Agent reports being overwhelmed by journal size | Pagination on `GET /api/tasks/:id/events`, or a `?since=<event_id>` cursor |
| Non-assignee side-note spam becomes a problem | Tighten to assignee-only on `POST /api/tasks/:id/journal` |
| Comment count never gets surfaced anywhere else | Consider whether the `💬 N` badge is worth the SQL aggregation |
| Multiple agents writing rapidly on the same task | Investigate whether SSE chattiness needs debouncing client-side |

## Open questions (not blockers)

- Should the `📓` icon differ between assignee and non-assignee entries, or is dimming + label sufficient? (Recommend: just dim + label; one icon.)
- Composer keyboard shortcuts — does ⌘↩ post the journal entry the same way it posts a comment? (Recommend: yes, focus determines target.)
