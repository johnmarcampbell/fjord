# agentic-kanban

A tiny Kanban board built for collaboration between one or two humans and a small
fleet of agents. Designed to run inside a trusted gateway — no built-in auth.

## Stack

- **Backend**: Node 22, TypeScript, Fastify, Drizzle ORM, better-sqlite3
- **Frontend**: React, Vite, TypeScript, Tailwind, dnd-kit, React Query
- **DB**: SQLite (single file)
- **Layout**: npm workspaces (`shared`, `backend`, `frontend`)

## Local development

```bash
npm install
npm run dev
```

This runs:

- Backend on `http://localhost:3000` (Fastify, with `pino-pretty` logs)
- Frontend on `http://localhost:5173` (Vite dev server, proxies `/api` → 3000)

Open `http://localhost:5173`. The UI prompts you to pick or create a user; that
identity is stored in `localStorage` and sent as `X-User-Id` on every request.

## Tests

```bash
npm test
```

Vitest runs against an in-memory SQLite DB via `app.inject()`.

## Production build

```bash
npm run build
KANBAN_STATIC_DIR=./frontend/dist KANBAN_DB_PATH=./data/kanban.db npm start
```

In production the backend serves the React build itself and is the single port
to expose.

## Docker

```bash
docker build -t agentic-kanban .
docker run -p 3000:3000 -v $(pwd)/data:/data agentic-kanban
```

The image bundles the backend and the frontend build. SQLite lives at
`/data/kanban.db`; mount a volume there to persist across restarts.

## Configuration

All config is read at startup from environment variables (Zod-validated).

| Variable                | Default                  | Notes                                       |
| ----------------------- | ------------------------ | ------------------------------------------- |
| `KANBAN_PORT`           | `3000`                   | HTTP listen port                            |
| `KANBAN_HOST`           | `0.0.0.0`                | HTTP listen host                            |
| `KANBAN_DB_PATH`        | `./data/kanban.db`       | SQLite file path; use `:memory:` for tests  |
| `KANBAN_LOG_LEVEL`      | `info`                   | `fatal`/`error`/`warn`/`info`/`debug`/`trace` |
| `KANBAN_CORS_ORIGINS`   | _(off)_                  | Comma-separated origins to allow            |
| `KANBAN_SEED_USERS`     | _(none)_                 | e.g. `alice:human,agent-coder:agent`        |
| `KANBAN_STATIC_DIR`     | _(none)_                 | Path to built frontend assets to serve      |
| `NODE_ENV`              | `development`            |                                             |

`KANBAN_SEED_USERS` only inserts users that don't already exist; it's safe to
keep set across restarts.

## API

Interactive docs: `http://<host>/api/docs` (Scalar API Reference from
auto-generated OpenAPI). Machine-readable spec at `/api/docs/openapi.json`.
Every write endpoint requires `X-User-Id: <known user id>`.

Key endpoints:

- `GET /api/tasks` — list all tasks (each with `blocked_by` and `blocking`)
- `POST /api/tasks` — create
- `PATCH /api/tasks/:id` — update; requires `version` for optimistic concurrency (409 on mismatch)
- `DELETE /api/tasks/:id` — hard delete
- `GET /api/tasks/:id/events` — comment + system-event timeline
- `POST /api/tasks/:id/comments` — append a markdown comment
- `POST /api/tasks/:id/blockers` — add a `blocker_id` (cycle-checked)
- `DELETE /api/tasks/:id/blockers/:blocker_id`
- `GET /api/events/stream` — Server-Sent Events; emits `task.created`,
  `task.updated`, `task.deleted`, `task.event_added` notifications. Clients use
  these as cache-invalidation signals and re-fetch.

### Optimistic concurrency

Each task has a `version` integer that increments on every write. `PATCH`
requires the version the caller last saw; mismatch returns `409` with the
current version so the caller can re-fetch and retry.

### Blocked-by / blocking

Stored once in a `task_dependencies(blocker_id, blocked_id)` table; both views
are derived. A task is rendered as **blocked** in the UI when any of its
blockers is not in the `Done` column. Adding a dependency that would create a
cycle (including a self-edge) returns `400`.

### Columns

Fixed set: `Backlog`, `To Do`, `In Progress`, `In Review`, `Done`. Ordering
within a column is manual via a float `position`; new tasks default to the top
of `Backlog`.

## What's intentionally not in v1

Authentication, file attachments, search, configurable columns/labels,
soft-delete/archive, per-user views, MCP server, backups, and frontend
component/E2E tests.

## Container note

This Dockerfile builds the Kanban app only. The Openclaw integration is
expected to live in a separate downstream Dockerfile that uses this image as
a base or combines its artifacts with Openclaw.
