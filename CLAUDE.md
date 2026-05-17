# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**agentic-kanban** is a small Kanban board for collaboration between one or two humans and agents. It's designed to run in a trusted gateway (no built-in auth) and be deployed alongside Openclaw.

### Key constraints
- **No authentication** — identity is user-selected and stored in localStorage, sent as `X-User-Id` header
- **Optimistic concurrency** — tasks have a `version` field; PATCH requests must include the version the caller last saw, returning 409 if stale
- **No soft deletes** — hard deletes only
- **Fixed columns** — `Backlog`, `To Do`, `In Progress`, `In Review`, `Done` (cannot be customized)
- **Blocking as a graph** — tasks can block other tasks; cycles are prevented; blocked state is derived from the blocker's column (blocked if any blocker is not in `Done`)

## Monorepo structure

Three npm workspaces under a single `package.json`:

- **`shared/`** — TypeScript types and constants shared between frontend and backend (`Column`, `Task`, `User`, `TaskEvent`, request/response interfaces)
- **`backend/`** — Node 22, Fastify, Drizzle ORM, better-sqlite3
- **`frontend/`** — React 18, Vite, React Query, dnd-kit, Tailwind CSS

## Common development commands

### From the root

```bash
npm install                 # Install dependencies
npm run dev                # Run backend + frontend in parallel (port 3000 + 5173)
npm run build              # Build shared, frontend, then backend
npm test                   # Build shared, run backend tests (vitest)
npm start                  # Start backend only (backend/dist/index.js)
```

### Backend only (`backend/`)

```bash
npm run dev                # tsx watch src/index.ts (auto-reload)
npm run build              # tsc
npm run test               # vitest run
npm run test:watch        # vitest (interactive watch)
npm run typecheck         # tsc --noEmit
npm run db:generate       # drizzle-kit generate (after schema changes)
```

### Frontend only (`frontend/`)

```bash
npm run dev               # vite (dev server on :5173)
npm run build             # tsc -b && vite build
npm run preview           # vite preview
npm run typecheck         # tsc -b --noEmit
```

## Shared workspace

Exports:
- Constants: `COLUMNS` (the five kanban columns)
- Types: `User`, `Task`, `Project`, `TaskEvent`, `Column`, `UserKind`
- Request/response interfaces: `CreateTaskRequest`, `UpdateTaskRequest`, etc.
- Helpers: `isTaskBlocked()` — determines if a task should be rendered as blocked based on its blockers' columns

## Backend architecture

### Server structure
[backend/src/server.ts](backend/src/server.ts): `buildApp()` creates the Fastify instance with:
- Database decoration (`app.db`)
- EventBus decoration (`app.events`) — in-memory pub/sub for SSE clients
- Swagger/OpenAPI docs at `/api/docs`
- Static file serving (frontend build, if `KANBAN_STATIC_DIR` is set)

### Database
- **ORM**: Drizzle ORM with better-sqlite3
- **Schema**: [backend/src/db/schema.ts](backend/src/db/schema.ts) — `users`, `projects`, `tasks`, `taskEvents`, `taskDependencies`
- **Migrations**: `backend/migrations/` (auto-applied at startup)
- **Connection**: Single `DBHandle` (Drizzle database instance) shared across the app

### Routes
- [backend/src/routes/users.ts](backend/src/routes/users.ts) — GET/POST users
- [backend/src/routes/projects.ts](backend/src/routes/projects.ts) — CRUD projects
- [backend/src/routes/tasks.ts](backend/src/routes/tasks.ts) — CRUD tasks, comments, blockers
- [backend/src/routes/stream.ts](backend/src/routes/stream.ts) — GET /api/events/stream (SSE endpoint)

### Services
- [backend/src/services/tasks.ts](backend/src/services/tasks.ts) — Business logic for task mutations (ensure task events are recorded, version bumping, cycle detection for blockers, etc.)

### Event Bus
- [backend/src/event_bus.ts](backend/src/event_bus.ts) — In-memory pub/sub for SSE. On any task mutation, the service emits `StreamEvent` to notify connected clients to re-fetch. EventBus holds no persistence; clients subscribe via GET `/api/events/stream`.

### Configuration
Read at startup from environment variables (Zod-validated in [backend/src/config.ts](backend/src/config.ts)):
- `KANBAN_PORT` (default 3000)
- `KANBAN_HOST` (default 0.0.0.0)
- `KANBAN_DB_PATH` (default `./data/kanban.db`)
- `KANBAN_LOG_LEVEL` (default `info`)
- `KANBAN_CORS_ORIGINS` (comma-separated, optional)
- `KANBAN_SEED_USERS` (e.g., `alice:human,agent-coder:agent`, idempotent)
- `KANBAN_STATIC_DIR` (path to frontend build for production serving)
- `NODE_ENV` (default `development`)

## Frontend architecture

### Data flow
- **User identity**: stored in localStorage, UI shows `UserPicker` to select/create on first load, sent in every API request as `X-User-Id` header
- **State**: React Query for server state (`@tanstack/react-query`), local state for UI (theme, open task drawer, creating)
- **Real-time**: [frontend/src/lib/stream.ts](frontend/src/lib/stream.ts) connects to SSE endpoint, uses events as cache-invalidation signals (re-fetches task list on any mutation)
- **Drag & drop**: [frontend/src/components/Board.tsx](frontend/src/components/Board.tsx) and [frontend/src/components/Column.tsx](frontend/src/components/Column.tsx) use dnd-kit for column/position changes

### Theme
Light/dark mode stored in localStorage (`ak-theme`) and applied to `document.documentElement.data-theme`. Tailwind CSS respects this via the `data-theme` selector in [frontend/tailwind.config.ts](frontend/tailwind.config.ts).

### Key components
- [frontend/src/components/Board.tsx](frontend/src/components/Board.tsx) — renders five columns, subscribes to task list
- [frontend/src/components/Column.tsx](frontend/src/components/Column.tsx) — dnd-kit sortable container, handles drop (position update)
- [frontend/src/components/TaskCard.tsx](frontend/src/components/TaskCard.tsx) — renders task with blocked state, opens drawer on click
- [frontend/src/components/TaskDrawer.tsx](frontend/src/components/TaskDrawer.tsx) — side panel for editing task details, comments, blockers
- [frontend/src/components/NewTaskDialog.tsx](frontend/src/components/NewTaskDialog.tsx) — modal for quick task creation
- [frontend/src/components/UserPicker.tsx](frontend/src/components/UserPicker.tsx) — select or create user on first load

### API client
[frontend/src/lib/api.ts](frontend/src/lib/api.ts): Wrapper around fetch with user ID in headers. Throws `ApiError` (with status, message, body) on non-2xx responses.

## API overview

All write endpoints require `X-User-Id` header. Every task has a `version` integer; PATCH requires the version the caller last saw (optimistic concurrency, returns 409 on mismatch).

### Gotchas for agents
- **PATCH requires `version`** — always include the `version` field from the last task you fetched; returns 409 if stale
- **Archive requires Done** — `POST /api/tasks/:id/archive` returns 400 unless the task is in the `Done` column
- **Blocker IDs are task IDs** — `blocker_id` in both the `POST .../blockers` body and the `DELETE .../blockers/:blocker_id` path is the ID of the blocking *task*, not a relationship/link ID
- **Archived tasks hidden by default** — `GET /api/tasks` excludes archived tasks; use `?include_archived=true`
- **No user cascade** — deleting a user leaves tasks with stale `assigned_to`/`reported_by` values
- **Journal vs comments** — journal entries (`POST .../journal`) are the assignee's durable working notes; comments (`POST .../comments`) are for cross-actor communication

### Tasks
- `GET /api/tasks` — list all (includes `blocked_by` and `blocking` arrays); pass `?include_archived=true` to include archived tasks
- `POST /api/tasks` — create (defaults column to `Backlog`, position to top)
- `PATCH /api/tasks/:id` — update title, column, position, assignment, etc. Requires `version`.
- `DELETE /api/tasks/:id` — hard delete
- `GET /api/tasks/:id/events` — timeline (comments + system events); filter by `?kind=<event_type>`
- `POST /api/tasks/:id/comments` — add markdown comment (visible to all actors)
- `POST /api/tasks/:id/journal` — append a durable working note (agent's working memory; use for notes to your future self, not cross-actor communication)
- `POST /api/tasks/:id/blockers` — add blocking dependency (cycle-checked); body: `{ "blocker_id": "<task-id>" }`
- `DELETE /api/tasks/:id/blockers/:blocker_id` — remove blocking dependency; `:blocker_id` is the blocking task's ID
- `POST /api/tasks/:id/archive` — archive a task (must be in `Done` column)
- `POST /api/tasks/:id/unarchive` — restore an archived task

### Projects
- `GET /api/projects`
- `POST /api/projects` — create
- `PATCH /api/projects/:id` — update
- `DELETE /api/projects/:id`

### Users
- `GET /api/users`
- `GET /api/users/:id`
- `POST /api/users` — create
- `DELETE /api/users/:id` — hard delete (no cascade; tasks retain stale user references)

### Stream
- `GET /api/events/stream` — Server-Sent Events; emits `task.created`, `task.updated`, `task.deleted`, `task.event_added`

### Server
- `GET /api/health` — liveness check; always public (no auth required)
- `GET /api/auth/validate` — returns `{ required: bool, valid?: bool }`; always accessible without a valid token
- `GET /api/config` — returns `{ demo: bool, demo_reset_minutes: number | null }`

Interactive docs at `/api/docs` (auto-generated Swagger UI). Machine-readable OpenAPI JSON at `/api/docs/json`.

## Testing

Backend tests use Vitest with `app.inject()` (in-memory Fastify testing). Database is in-memory SQLite (`:memory:` path).

```bash
npm test              # vitest run (backend/tests/)
npm run test:watch   # vitest (interactive)
```

Tests are in `backend/tests/` and follow `.test.ts` pattern.

## Production

```bash
npm run build
KANBAN_STATIC_DIR=./frontend/dist KANBAN_DB_PATH=./data/kanban.db npm start
```

Or via Docker:

```bash
docker build -t agentic-kanban .
docker run -p 3000:3000 -v $(pwd)/data:/data agentic-kanban
```

The backend serves both the API and the React build on a single port.

## Notes

- **No component/E2E tests** — component correctness is verified manually (run dev server, test in browser)
- **No authentication** — relies on trusted gateway
- **Soft deletes** — not implemented; use hard delete. Archive/unarchive is supported for tasks in `Done`.
- **Configurable columns** — not supported; fixed set of five
- **No file attachments** — only markdown comments
- **No search** — full task list fetched on load
