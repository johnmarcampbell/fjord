# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**agentic-kanban** is a small Kanban board for collaboration between one or two humans and agents. It is designed to be deployed alongside Openclaw with first-class authentication.

### Key constraints
- **Per-user authentication** — humans log in with a handle + scrypt-hashed password and receive an HttpOnly session cookie (`ak_session`). Agents and CLI callers authenticate with `Authorization: Bearer ak_...` API tokens. Demo mode auto-logs every visitor in as `default-administrator` ([ADR-0008](docs/adr/0008-password-authentication.md), [ADR-0009](docs/adr/0009-password-hash-format.md), [ADR-0010](docs/adr/0010-api-token-format-and-storage.md)).
- **CSRF** — cookie-authenticated writes require `X-Requested-With: agentic-kanban`. Bearer-authenticated callers are exempt (no ambient credential, no CSRF risk).
- **Passwordless-once** — a human user whose `password_hash IS NULL` may log in once. The session is real but write endpoints respond with `403 set_password_required` until they hit `POST /api/auth/change-password`. The frontend bounces them to a forced-set-password screen.
- **Optimistic concurrency** — tasks have a `version` field; PATCH requests must include the version the caller last saw, returning 409 if stale
- **No soft deletes** — hard deletes only, with one exception: **users are soft-deleted** ([ADR-0004](docs/adr/0004-soft-delete-users.md)) because their IDs are referenced by tasks, events, comments, and journal entries
- **Fixed columns** — `Backlog`, `To Do`, `In Progress`, `In Review`, `Done` (cannot be customized)
- **Blocking as a graph** — tasks can block other tasks; cycles are prevented; blocked state is derived from the blocker's column (blocked if any blocker is not in `Done`)

## Monorepo structure

Three npm workspaces under a single `package.json`:

- **`shared/`** — TypeScript types and constants shared between frontend and backend (`Column`, `Task`, `User`, `TaskEvent`, request/response interfaces)
- **`backend/`** — Node 24, Fastify, Drizzle ORM, node:sqlite
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
- Scalar API Reference at `/api/docs` (OpenAPI spec at `/api/docs/openapi.json`)
- Static file serving (frontend build, if `KANBAN_STATIC_DIR` is set)

### Database
- **ORM**: Drizzle ORM with node:sqlite
- **Schema**: [backend/src/db/schema.ts](backend/src/db/schema.ts) — `users` (with `password_hash`), `sessions`, `api_tokens`, `projects`, `tasks`, `taskEvents`, `taskDependencies`
- **Migrations**: `backend/migrations/` (auto-applied at startup)
- **Connection**: Single `DBHandle` (Drizzle database instance) shared across the app

### Routes
- [backend/src/routes/auth.ts](backend/src/routes/auth.ts) — login/logout/change-password/me
- [backend/src/routes/tokens.ts](backend/src/routes/tokens.ts) — POST/GET/DELETE `/api/users/:id/tokens`
- [backend/src/routes/users.ts](backend/src/routes/users.ts) — GET/POST users
- [backend/src/routes/projects.ts](backend/src/routes/projects.ts) — CRUD projects
- [backend/src/routes/tasks.ts](backend/src/routes/tasks.ts) — CRUD tasks, comments, blockers
- [backend/src/routes/stream.ts](backend/src/routes/stream.ts) — GET /api/events/stream (SSE endpoint)

### Services
- [backend/src/services/tasks.ts](backend/src/services/tasks.ts) — Business logic for task mutations (ensure task events are recorded, version bumping, cycle detection for blockers, etc.)
- [backend/src/services/passwords.ts](backend/src/services/passwords.ts) — scrypt hashing in the self-describing format from [ADR-0009](docs/adr/0009-password-hash-format.md)
- [backend/src/services/sessions.ts](backend/src/services/sessions.ts) — server-side session lifecycle
- [backend/src/services/api_tokens.ts](backend/src/services/api_tokens.ts) — token generation (dual `lookup_hash` + `token_hash`), verify, revoke

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
- `KANBAN_BOOTSTRAP_PASSWORD` (optional; seeds the `default-administrator` password on first boot if its `password_hash` is still null. Ignored thereafter and in demo mode.)
- `KANBAN_SESSION_IDLE_DAYS` (default 30; idle expiry for session cookies)
- `KANBAN_EDIT_WINDOW_MINUTES` (default 5; minutes after creation during which the author may edit or delete a comment or journal entry)
- `NODE_ENV` (default `development`)

## Frontend architecture

### Data flow
- **User identity**: resolved from `GET /api/auth/me` via the session cookie. `AuthGate` shows `LoginPage` when unauthenticated, `SetPasswordPage` when `requires_password_set` is true, otherwise the app. In demo mode the gate auto-logs in as `default-administrator` with no body. The legacy `X-User-Id` header and `UserPicker` are gone.
- **State**: React Query for server state (`@tanstack/react-query`), local state for UI (theme, open task drawer, creating)
- **Real-time**: [frontend/src/lib/stream.ts](frontend/src/lib/stream.ts) connects to the SSE endpoint over the session cookie (no per-request header). Events are cache-invalidation signals; the task list is re-fetched on any mutation.
- **Drag & drop**: [frontend/src/components/Board.tsx](frontend/src/components/Board.tsx) and [frontend/src/components/Column.tsx](frontend/src/components/Column.tsx) use dnd-kit for column/position changes

### Theme
Light/dark mode stored in localStorage (`ak-theme`) and applied to `document.documentElement.data-theme`. Tailwind CSS respects this via the `data-theme` selector in [frontend/tailwind.config.ts](frontend/tailwind.config.ts).

### Routes
Routing uses `react-router-dom` v6.
- `/` — board / backlog / archive (see `BoardPage`)
- `/users` — user management; the `+ New user` tile creates users, and the current user can edit or self-delete their own card. The legacy header create flow has been removed (see [ADR-0003](docs/adr/0003-user-creation-on-users-page.md)). When the user table is empty, the app auto-redirects here.
- `/tasks/:id` — full task detail; shareable URL. The `TaskDrawer` is the at-a-glance peek and links here via the ↗ "Open full view" button.

### Key components
- [frontend/src/components/Board.tsx](frontend/src/components/Board.tsx) — renders five columns, subscribes to task list
- [frontend/src/components/Column.tsx](frontend/src/components/Column.tsx) — dnd-kit sortable container, handles drop (position update)
- [frontend/src/components/TaskCard.tsx](frontend/src/components/TaskCard.tsx) — renders task with blocked state, opens drawer on click
- [frontend/src/components/TaskDrawer.tsx](frontend/src/components/TaskDrawer.tsx) — side panel for editing task details, comments, blockers
- [frontend/src/components/NewTaskDialog.tsx](frontend/src/components/NewTaskDialog.tsx) — modal for quick task creation
- [frontend/src/components/UserMenu.tsx](frontend/src/components/UserMenu.tsx) — header avatar/menu with "Profile & API tokens" (deep-links to `/users?edit=<self>`), "Change password", "Log out"
- [frontend/src/components/UserCard.tsx](frontend/src/components/UserCard.tsx) — single user tile rendered on `/users`
- [frontend/src/components/UserFormDialog.tsx](frontend/src/components/UserFormDialog.tsx) — shared create + edit modal. In edit mode it now hosts the per-user **API tokens** section (`TokenList`), an admin-only **Reset password** action for other users, and self-delete. Whoever can open the dialog (admin, or the user themselves) can manage that user's tokens.
- [frontend/src/components/ChangePasswordDialog.tsx](frontend/src/components/ChangePasswordDialog.tsx) — voluntary password-change flow (current + new + confirm)
- [frontend/src/components/TokenList.tsx](frontend/src/components/TokenList.tsx) and [frontend/src/components/TokenCreateDialog.tsx](frontend/src/components/TokenCreateDialog.tsx) — API token management, embedded in `UserFormDialog`. Both surfaces label the bound user (`@handle`) so admins issuing tokens for agents can't get the binding wrong.

### API client
[frontend/src/lib/api.ts](frontend/src/lib/api.ts): Wrapper around `fetch` that sends `credentials: "include"` (session cookie) and `X-Requested-With: agentic-kanban` on writes. Throws `ApiError` (with status, message, body) on non-2xx responses. On 401 it dispatches the auth-logout event so `AuthGate` re-renders the login page.

## API overview

All authenticated endpoints require either an `ak_session` cookie (humans, via `POST /api/auth/login`) or `Authorization: Bearer ak_...` (agents and CLI, via API tokens). Cookie-authenticated writes additionally require `X-Requested-With: agentic-kanban`. Every task has a `version` integer; PATCH requires the version the caller last saw (optimistic concurrency, returns 409 on mismatch).

### Roles and access control
Users have a `role` field: `"Admin"` or `"Member"` (default). The built-in `default-administrator` user always has Admin role and cannot be deleted.

- **Admins** can access all spaces, manage all users, and manage any space (full administrative powers, regardless of membership). However, Admins are **not** automatically *members* of every space — they must explicitly join spaces to appear in member lists, the assignee picker, and the SSE event stream for that space. See [ADR-0012](docs/adr/0012-space-access-carries-affiliation-not-just-permission.md).
- **Members** can only access spaces they created or have been explicitly granted access to (via `POST /api/spaces/:id/access`). Members can create spaces (they become Owner of that space) but 403 on other spaces' resources.
- **Soft-deleted actors** receive 400 on any authenticated request.

### Gotchas for agents
- **PATCH requires `version`** — always include the `version` field from the last task you fetched; returns 409 if stale
- **Archive requires Done** — `POST /api/tasks/:id/archive` returns 400 unless the task is in the `Done` column
- **Blocker IDs are task IDs** — `blocker_id` in both the `POST .../blockers` body and the `DELETE .../blockers/:blocker_id` path is the ID of the blocking *task*, not a relationship/link ID
- **Archived tasks hidden by default** — `GET /api/tasks` excludes archived tasks; use `?include_archived=true`
- **Tasks/projects scoped to accessible spaces** — `GET /api/tasks` and `GET /api/projects` return only items in spaces the actor can access; Admins see everything
- **Users are soft-deleted** — `DELETE /api/users/:id` sets `deleted_at`, nulls `password_hash`, and deletes the user's sessions; the row stays so historical attribution on tasks, events, comments, and journal entries continues to render. `GET /api/users` includes deleted users (clients filter them out of selection UIs); `PATCH /api/users/:id` returns 404 for a deleted user. Handles remain reserved. See [ADR-0004](docs/adr/0004-soft-delete-users.md).
- **Journal vs comments** — journal entries (`POST .../journal`) are the assignee's durable working notes; comments (`POST .../comments`) are for cross-actor communication
- **Handle format** — `handle` is lowercased and must match `^[a-z0-9_-]{1,32}$`; some words are reserved (`me`, `admin`, `system`, `api`, `app`, `root`, `support`, `help`, `agentic-kanban`, `agent`, `user`, `users`, `openclaw`); returns 400 if invalid or reserved, 409 if already taken
- **password_hash never returned** — `PATCH /api/users/:id` accepts `password_hash: null` from Admins only (and only against other users) to reset a password. Self-service password changes go through `POST /api/auth/change-password`.
- **role field** — `POST /api/users` and `PATCH /api/users/:id` accept `role: "Admin" | "Member"`; only Admins may set a role; the default-administrator's role cannot be changed
- **API tokens** — agents and CLI callers authenticate with `Authorization: Bearer ak_<32 base32 chars>`. Tokens are listable, revocable, and may carry an `expires_at`. The plaintext is shown exactly once at creation.

### Tasks
- `GET /api/tasks` — list all (includes `blocked_by` and `blocking` arrays); pass `?include_archived=true` to include archived tasks
- `POST /api/tasks` — create (defaults column to `Backlog`, position to top)
- `PATCH /api/tasks/:id` — update title, column, position, assignment, etc. Requires `version`.
- `DELETE /api/tasks/:id` — hard delete
- `GET /api/tasks/:id/events` — timeline (comments + system events); filter by `?kind=<event_type>`
- `POST /api/tasks/:id/comments` — add markdown comment (visible to all actors)
- `POST /api/tasks/:id/journal` — append a durable working note (agent's working memory; use for notes to your future self, not cross-actor communication)
- `PATCH /api/tasks/:id/events/:event_id` — edit a comment or journal entry (author-only, within `KANBAN_EDIT_WINDOW_MINUTES`); body: `{ "body": "<text>" }`
- `DELETE /api/tasks/:id/events/:event_id` — delete a comment or journal entry (author-only, within window, and only if no subsequent activity exists); returns 403 with `code: subsequent_activity` or `code: edit_window_expired`
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
- `POST /api/users` — create (Admin only); derives `handle` from `display_name` if omitted; picks deterministic emoji `avatar` if omitted; accepts optional `role`
- `PATCH /api/users/:id` — update `display_name`, `handle`, `kind`, `title`, `bio`, `avatar`; Admins may also set `role`; Admins may set `password_hash: null` on *other* users to reset their password; `id` and `created_at` are not editable
- `DELETE /api/users/:id` — soft delete (sets `deleted_at`, nulls `password_hash`, deletes sessions); idempotent. The row stays so attribution still renders; handle remains reserved. The `default-administrator` cannot be deleted. See [ADR-0004](docs/adr/0004-soft-delete-users.md).

### Auth
- `POST /api/auth/login` — body `{ handle?, password? }`. In demo mode the body is ignored and a session is issued for `default-administrator`. A human with `password_hash IS NULL` may sign in with no password (passwordless-once); their next write request returns `403 set_password_required` until they call `change-password`.
- `POST /api/auth/logout` — deletes the current session and clears the cookie.
- `POST /api/auth/logout-all` — deletes every session for the current actor.
- `POST /api/auth/change-password` — body `{ current_password?, new_password }`. `current_password` is required unless the user's hash is currently null (passwordless-once flow). Other sessions for the user are invalidated.
- `GET /api/auth/me` — returns `{ id, display_name, handle, kind, role, avatar, requires_password_set }`.

### API tokens
- `POST /api/users/:id/tokens` — issue a token; returns `{ ..., token: "ak_..." }` exactly once. Caller must be Admin or the target user.
- `GET /api/users/:id/tokens` — list tokens (no plaintext, no hashes). `?include_revoked=true` to show revoked ones.
- `DELETE /api/users/:id/tokens/:token_id` — soft-delete (sets `revoked_at`).

### Spaces
- `GET /api/spaces` — list accessible spaces (all for Admins; owned + granted for Members)
- `POST /api/spaces` — create (any user); creator becomes Owner (`created_by`)
- `PATCH /api/spaces/:id` — rename; Owner or Admin only
- `DELETE /api/spaces/:id` — hard delete (must be empty of tasks); Owner or Admin only
- `POST /api/spaces/:id/archive` — archive; Owner or Admin only
- `POST /api/spaces/:id/unarchive` — restore; Owner or Admin only
- `GET /api/spaces/:id/access` — list grants (Owner or Admin only); returns `[{ user_id, space_id, granted_at, granted_by }]`
- `POST /api/spaces/:id/access` — grant a user (or Admin) access/affiliation; body: `{ "user_id": "<id>" }`; Owner or Admin only; 400 if already affiliated
- `DELETE /api/spaces/:id/access/:user_id` — revoke access; Owner or Admin only; 400 if target is the space Owner

### Stream
- `GET /api/events/stream` — Server-Sent Events; emits `task.created`, `task.updated`, `task.deleted`, `task.event_added` (filtered to the subscriber's accessible spaces at connect time)

### Server
- `GET /api/health` — liveness check; always public (no auth required)
- `GET /api/config` — returns `{ demo: bool, demo_reset_minutes: number | null }`; always public

Interactive docs at `/api/docs` (auto-generated Scalar API Reference). Machine-readable OpenAPI JSON at `/api/docs/openapi.json`.

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
- **Authentication** — password + session cookie for humans, API tokens for agents; demo mode auto-logs visitors in as `default-administrator` (see [ADR-0008](docs/adr/0008-password-authentication.md))
- **Soft deletes** — only for users (ADR-0004); tasks and projects are hard-deleted. Archive/unarchive is supported for tasks in `Done`.
- **Configurable columns** — not supported; fixed set of five
- **No file attachments** — only markdown comments
- **No search** — full task list fetched on load
- **Demo mode must stay in sync** — any new schema table or column that affects the user-visible feature set should be reflected in [`backend/demo/seed.sql`](backend/demo/seed.sql). The seed is the canonical demo state and is re-applied on every periodic reset.
