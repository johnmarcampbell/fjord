# Implementation plan — Issue #59: User View page

This plan is self-contained. Execute it top-to-bottom. The repo is
`fjord`; read [CLAUDE.md](../../CLAUDE.md) for monorepo conventions
and [CONTEXT.md](../../CONTEXT.md) for domain terminology. The deviation from
the issue text (creation flow location) is recorded in
[ADR-0003](../adr/0003-user-creation-on-users-page.md) — read it before
starting.

## Goal

Add a `/users` route that lists every user as a card and lets the current user
self-edit and self-delete their profile. Move user creation from the header
`UserPicker` into a `+ New user` tile on this page. Remove the avatar/emoji
glyphs from `UserPicker` and the "Acting as" display per maintainer
preference. This is a **frontend-only** change — issue #57 already shipped all
required API endpoints.

## Workflow

Per the standing workflow for this repo:

1. `git pull origin main`
2. `git checkout -b feat/issue-59-user-view-page` — **before any code edits**
3. Implement the steps below
4. Pre-PR checks: `npm test`, `npm run typecheck` (in both `backend/` and
   `frontend/`), `npm run build`, `docker build -t fjord .`
5. Open PR with body containing "Resolves #59"

## Decisions already made

These are settled. If you find yourself wanting to deviate, stop and surface it.

| Decision | Choice |
|---|---|
| Router | `react-router-dom` v6 (new dependency) |
| Routes | `/` → board (existing view tabs unchanged), `/users` → new page |
| Page file location | `frontend/src/pages/BoardPage.tsx`, `frontend/src/pages/UsersPage.tsx` (new `pages/` directory) |
| `BoardPage` lift-out | Yes — extract the board/backlog/archive guts of `AppContent` into `BoardPage.tsx`; `App.tsx` holds providers, router, and shared header chrome |
| Card grid | Responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` |
| Pagination/search | None |
| Loading state | Skeleton cards (3 placeholders) |
| Empty state | "No users yet" with the `+ New user` tile as the only action |
| Card fields displayed | avatar, `display_name`, `@handle`, `title`, kind indicator, `bio` (no "role") |
| Kind indicator | Reuse FilterBar's idiom: small round dot (human) / small square (agent), plus the word "bot" only for agents |
| Edit affordance | "Edit" button visible **only** on the current user's card; other cards have no edit button |
| Self-card highlight | A small "You" pill on the current user's card (helps you locate it) |
| Edit / create dialog | One component `UserFormDialog` with a `mode: "create" | "edit"` prop; modal style (centered, matches `NewTaskDialog`) |
| Editable fields in dialog | `display_name`, `handle`, `kind`, `title`, `bio`, `avatar`. The `id` is hidden in create mode and never shown |
| `id` generation | Auto-generated `crypto.randomUUID()`; never exposed to the user |
| Avatar picker | 6×5 grid of the 30 `AVATAR_EMOJI_LIST` tiles + a single text input for a custom emoji or http(s) URL |
| Validation | Lightweight client-side (handle regex + reserved-word check + length limits) for instant feedback; uniqueness via server 409 surfaced under the handle field |
| Form library | None — plain `useState` |
| Self-delete | "Delete account" button at the bottom of the dialog in edit mode, visually separated (danger styling), with a confirm step (second click) |
| Bootstrap (zero users) | Auto-redirect to `/users` from any other route; empty state with `+ New user` tile drives creation |
| Header on `/users` | All controls remain visible; tab clicks navigate to `/` and persist the view via `localStorage("fjord-view")` |
| Entry point to `/users` | A quiet "Users" text link in the right-hand cluster, next to "API docs"; active-state styling (`text-ink` vs `text-ink-subtle`) when on `/users` |
| UserPicker emoji removal | Remove `AvatarGlyph` rendering and the `${u.avatar} ` prefix on `<option>` text; keep the `<select>`, "Acting as" label, and the `(agent)` suffix |
| UserPicker creation flow removal | Delete the `+ Add identity` button, the inline create form, the `creating`/`newId`/`newKind` state, and the `createMutation` |
| Backend changes | None — #57 endpoints are sufficient |
| ADR | `docs/adr/0003-user-creation-on-users-page.md` (already written) |
| CONTEXT.md | No changes — no new domain terms |
| Tests | Backend: none new. Frontend: project has no component tests; verify manually via `npm run dev` |

## Out of scope

- Admin-edit-anyone (gated on #60)
- Delete-anyone (gated on #60)
- `/users/:handle` per-user profile pages (future)
- `@mentions` rendering (issue #3)
- Avatars in `FilterBar` / `TaskCard` / `TaskDrawer` (intentionally deferred in #57)
- Any backend code changes
- Component / E2E tests (the project has none)

---

## Step 1 — Install router

From the repo root:

```bash
cd frontend && npm install react-router-dom@^6 && cd ..
```

Verify `package.json` in `frontend/` lists `react-router-dom` under
`dependencies`. Commit `frontend/package.json` and the root `package-lock.json`.

---

## Step 2 — Create the `pages/` directory and lift out `BoardPage`

Create `frontend/src/pages/BoardPage.tsx`. Move everything in the current
`AppContent` function of [App.tsx](../../frontend/src/App.tsx) **except**:

- The provider wrapping (`SpaceProvider`, `FilterProvider`)
- The `<Toaster>` instance
- The outer flex container and the `<header>` chrome
- The `useStreamSubscription`, `useQuery(["config"])`, and theme state

…into a new `BoardPage` component. Concretely:

- `view` state and `setViewAndPersist`
- `tasks`, `archivedTasks`, counts, `openTaskId`, `creating`
- The `<main>` body that renders `<Board>` / `<BacklogView>` / `<ArchiveView>`
- `NewTaskDialog` and `TaskDrawer` mounting

Move the tab row that toggles `view` *into* `BoardPage` as well, since those
tabs are board-context controls. The header still renders them (they live in
the shared header), but they need to call `navigate("/")` and set
`localStorage("fjord-view")` when clicked from anywhere. See Step 3.

Restructure `App.tsx` so that:

```tsx
export default function App() {
  return (
    <BrowserRouter>
      <SpaceProvider>
        <FilterProvider>
          <AppShell />
        </FilterProvider>
      </SpaceProvider>
    </BrowserRouter>
  );
}

function AppShell() {
  // useStreamSubscription, useQuery(["config"]), theme state, navigate, location
  // Render: demo banner, <Header />, <Routes>:
  //   <Route path="/" element={<BoardPage />} />
  //   <Route path="/users" element={<UsersPage />} />
  //   <Route path="*" element={<Navigate to="/" replace />} />
  // Render <Toaster /> at the end
}
```

Extract the header JSX into its own `Header` component (inside `App.tsx` or a
new `frontend/src/components/Header.tsx` — your call; one file is fine). The
header receives the current `view`, the counts, and the click handlers as
props or reads them from a small `useLocation()` hook for the active-state of
the Users link.

The tab buttons in `Header` should:

```tsx
function navigateToBoardWithView(v: "board" | "backlog" | "archive") {
  localStorage.setItem("fjord-view", v);
  if (location.pathname !== "/") navigate("/");
  // BoardPage reads localStorage on mount; for in-page tab switches it also
  // needs to react to clicks. Keep the existing setView wiring inside
  // BoardPage and lift just the navigation concern here.
}
```

The cleanest split: `BoardPage` owns `view` state, persists to localStorage,
and the tab buttons in the header dispatch a custom event or call a callback
from a small context. **Recommended approach**: introduce a tiny
`BoardViewContext` (`frontend/src/lib/BoardViewContext.tsx`) holding
`{ view, setView }` with localStorage persistence. `AppShell` wraps the routes
in this provider; both `Header` and `BoardPage` consume it. When the header
tab is clicked on `/users`, `setView` updates the context + storage, and
`navigate("/")` lands on the board with the right tab active.

The counts (`boardCount`, `backlogCount`, `archiveCount`) currently come from
`useTasks` / `useArchivedTasks` — those queries are cheap and cached, so
calling them in `Header` too is fine. Alternatively, expose the counts via the
same context. Either works; pick whichever yields a smaller diff.

---

## Step 3 — Add the `UsersPage` scaffold

New file: `frontend/src/pages/UsersPage.tsx`.

Shape:

```tsx
import { useUsers } from "../lib/queries.js";
import { getCurrentUserId } from "../lib/user.js";
import { UserCard } from "../components/UserCard.js";
import { UserFormDialog } from "../components/UserFormDialog.js";
import { useState } from "react";

export function UsersPage() {
  const { data: users = [], isLoading } = useUsers();
  const [dialog, setDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; userId: string }
    | null
  >(null);
  const currentUserId = getCurrentUserId();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Users</h1>
        <p className="text-xs text-ink-subtle">{users.length} {users.length === 1 ? "user" : "users"}</p>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              isCurrent={u.id === currentUserId}
              onEdit={() => setDialog({ mode: "edit", userId: u.id })}
            />
          ))}
          <NewUserTile onClick={() => setDialog({ mode: "create" })} />
        </div>
      )}

      {dialog && (
        <UserFormDialog
          mode={dialog.mode}
          userId={dialog.mode === "edit" ? dialog.userId : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-44 animate-pulse rounded-xl border border-border bg-surface-subtle" />
      ))}
    </div>
  );
}

function NewUserTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-44 items-center justify-center rounded-xl border border-dashed border-border bg-transparent text-sm font-semibold text-ink-muted transition-colors hover:border-border-focus hover:bg-surface-hover hover:text-ink"
    >
      + New user
    </button>
  );
}
```

The empty state (`users.length === 0`) is *not* a special branch — the grid
just renders only the `NewUserTile`. Combined with the auto-redirect in
Step 7, that's the bootstrap experience.

---

## Step 4 — `UserCard` component

New file: `frontend/src/components/UserCard.tsx`.

```tsx
import type { User } from "@fjord/shared";

function AvatarGlyph({ avatar }: { avatar: string }) {
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    return <img src={avatar} alt="" className="h-12 w-12 rounded-full object-cover" />;
  }
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle text-2xl" aria-hidden>
      {avatar}
    </span>
  );
}

function KindIndicator({ kind }: { kind: User["kind"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
      <span
        className={kind === "agent" ? "inline-block h-2 w-2 rounded-sm bg-current opacity-60" : "inline-block h-2 w-2 rounded-full bg-current opacity-60"}
      />
      {kind === "agent" ? "bot" : "human"}
    </span>
  );
}

export function UserCard({
  user,
  isCurrent,
  onEdit,
}: {
  user: User;
  isCurrent: boolean;
  onEdit: () => void;
}) {
  return (
    <div className={`relative flex h-44 flex-col rounded-xl border bg-surface p-4 shadow-sm transition-colors ${isCurrent ? "border-accent/40 ring-1 ring-accent/20" : "border-border"}`}>
      {isCurrent && (
        <span className="absolute right-3 top-3 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
          You
        </span>
      )}
      <div className="flex items-start gap-3">
        <AvatarGlyph avatar={user.avatar} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{user.display_name}</div>
          <div className="truncate text-xs text-ink-subtle">@{user.handle}</div>
          {user.title && <div className="mt-1 truncate text-xs text-ink-muted">{user.title}</div>}
        </div>
      </div>
      <div className="mt-2 flex-1 overflow-hidden text-xs text-ink-muted">
        {user.bio ? (
          <p className="line-clamp-3 whitespace-pre-wrap">{user.bio}</p>
        ) : (
          <p className="italic text-ink-subtle">No bio</p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <KindIndicator kind={user.kind} />
        {isCurrent && (
          <button
            onClick={onEdit}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:bg-surface-hover"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
```

If `line-clamp-3` is not available (depends on Tailwind plugin), use a fixed
height + `overflow-hidden` with `whiteSpace: "pre-wrap"` on the inner element.
Check `frontend/tailwind.config.ts` first; if `@tailwindcss/line-clamp` isn't
already enabled, the plugin is built into Tailwind ≥ 3.3 and no config is
needed.

---

## Step 5 — `UserFormDialog` component (create + edit + self-delete)

New file: `frontend/src/components/UserFormDialog.tsx`.

This is the bulk of the work. Key behaviors:

- Modal, centered, `max-w-lg`, matching `NewTaskDialog`'s outer chrome
  (`fixed inset-0 z-50 flex items-center justify-center bg-black/40
  backdrop-blur-sm`).
- In **create mode**: all fields empty; on submit, generate
  `id = crypto.randomUUID()` and `POST /api/users`.
- In **edit mode**: pre-fill from `useUsers()` lookup by `userId`;
  on submit, `PATCH /api/users/:id`.
- Both modes use the same field layout.
- After successful create: set the new user as the current user
  (`setCurrentUserId(newUser.id)`), invalidate `["users"]`, close.
- After successful edit: invalidate `["users"]`, close.
- Self-delete (edit mode only): button at the bottom; first click toggles
  confirm state, second click within 5 seconds calls
  `DELETE /api/users/:id`, clears current user if it was self, invalidates,
  and closes.

Imports needed:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AVATAR_EMOJI_LIST,
  HANDLE_REGEX,
  RESERVED_HANDLES,
  type User,
  type UserKind,
} from "@fjord/shared";
import { api } from "../lib/api.js";
import { useUsers } from "../lib/queries.js";
import { getCurrentUserId, setCurrentUserId } from "../lib/user.js";
```

Form state shape:

```tsx
type FormState = {
  display_name: string;
  handle: string;
  kind: UserKind;
  title: string;
  bio: string;
  avatar: string;
};
```

Initial state for create mode: `display_name: ""`, `handle: ""`,
`kind: "human"`, `title: ""`, `bio: ""`,
`avatar: AVATAR_EMOJI_LIST[0]`. For edit mode: pre-fill from the looked-up
`User`.

### 5.1 Client-side validation helpers

Inline (in the same file is fine):

```tsx
const RESERVED_SET = new Set(RESERVED_HANDLES.map((h) => h.toLowerCase()));

function validateHandle(input: string): string | null {
  const lower = input.toLowerCase();
  if (!HANDLE_REGEX.test(lower)) {
    return "Handle must be 1-32 chars: lowercase letters, digits, _, or -";
  }
  if (RESERVED_SET.has(lower)) {
    return `"${lower}" is a reserved handle`;
  }
  return null;
}

function validateAvatar(input: string): string | null {
  if (!input) return "Avatar is required";
  if (input.startsWith("http://") || input.startsWith("https://")) {
    if (input.length > 2048) return "Avatar URL too long (max 2048 chars)";
    return null;
  }
  if (input.length < 1 || input.length > 8) return "Custom emoji must be 1-8 chars";
  let hasNonAscii = false;
  for (const ch of input) {
    if (ch.codePointAt(0)! > 127) { hasNonAscii = true; break; }
  }
  if (!hasNonAscii) return "Avatar must be an emoji or http(s) URL";
  return null;
}

function slugifyForHandle(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}
```

### 5.2 Handle auto-derivation in create mode

In create mode, while the handle field is empty *or* has never been touched
by the user, automatically reflect `slugifyForHandle(display_name)`. Once the
user focuses or edits the handle field, stop auto-syncing (track a
`handleTouched` boolean).

### 5.3 Avatar picker

Render a 6×5 grid of buttons, one per `AVATAR_EMOJI_LIST` entry. The currently
selected emoji gets a ring (`ring-2 ring-accent`). Below the grid, a single
text input labeled "Or custom emoji / image URL" that **mirrors and
overrides** the same `avatar` field. Clicking a grid tile sets `avatar` to
that emoji *and* updates the input. Typing in the input updates `avatar`
directly; the grid auto-deselects (no tile is ringed) if the value doesn't
match any tile.

```tsx
<div className="grid grid-cols-6 gap-1.5">
  {AVATAR_EMOJI_LIST.map((e) => (
    <button
      key={e}
      type="button"
      onClick={() => setAvatar(e)}
      className={`flex h-10 w-10 items-center justify-center rounded-lg border text-xl transition-colors ${avatar === e ? "border-accent ring-2 ring-accent" : "border-border hover:bg-surface-hover"}`}
      aria-label={`Pick emoji ${e}`}
    >
      {e}
    </button>
  ))}
</div>
<input
  type="text"
  value={avatar}
  onChange={(e) => setAvatar(e.target.value)}
  placeholder="🦊 or https://…"
  maxLength={2048}
  className="mt-2 w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors"
/>
```

### 5.4 Submit handler

```tsx
const queryClient = useQueryClient();

const createMutation = useMutation({
  mutationFn: (body: { id: string } & FormState) => api.createUser(body),
  onSuccess: (u) => {
    setCurrentUserId(u.id);
    queryClient.invalidateQueries({ queryKey: ["users"] });
    onClose();
  },
});

const updateMutation = useMutation({
  mutationFn: ({ id, body }: { id: string; body: Partial<FormState> }) =>
    api.updateUser(id, body),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["users"] });
    onClose();
  },
});

function onSubmit() {
  setServerError(null);
  const handleErr = validateHandle(form.handle);
  const avatarErr = validateAvatar(form.avatar);
  setFieldErrors({ handle: handleErr, avatar: avatarErr });
  if (handleErr || avatarErr) return;
  if (form.display_name.trim().length === 0) {
    setFieldErrors((e) => ({ ...e, display_name: "Required" }));
    return;
  }
  if (mode === "create") {
    createMutation.mutate({
      id: crypto.randomUUID(),
      display_name: form.display_name,
      handle: form.handle.toLowerCase(),
      kind: form.kind,
      title: form.title,
      bio: form.bio,
      avatar: form.avatar,
    });
  } else {
    updateMutation.mutate({
      id: userId!,
      body: {
        display_name: form.display_name,
        handle: form.handle.toLowerCase(),
        kind: form.kind,
        title: form.title,
        bio: form.bio,
        avatar: form.avatar,
      },
    });
  }
}
```

On mutation error, parse the `ApiError`:

```tsx
useEffect(() => {
  const err = createMutation.error || updateMutation.error;
  if (!err) { setServerError(null); return; }
  // ApiError shape (frontend/src/lib/api.ts): { status, message, body }
  // Read it to set serverError or fieldErrors.handle for 409.
  const e = err as { status?: number; message?: string };
  if (e.status === 409 && e.message?.toLowerCase().includes("handle")) {
    setFieldErrors((prev) => ({ ...prev, handle: e.message ?? "Handle already taken" }));
  } else {
    setServerError(e.message ?? "Something went wrong");
  }
}, [createMutation.error, updateMutation.error]);
```

(Inspect `frontend/src/lib/api.ts` for the exact `ApiError` shape; adjust if
fields differ.)

### 5.5 Add `updateUser` and `deleteUser` to the API client

File: [`frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts).

Add (if not already present):

```ts
updateUser(id: string, body: UpdateUserRequest): Promise<User> {
  return request<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
},
deleteUser(id: string): Promise<void> {
  return request<void>(`/api/users/${id}`, { method: "DELETE" });
},
```

Import `UpdateUserRequest` and `User` from `@fjord/shared` if not
already.

### 5.6 Self-delete

In edit mode only, render at the bottom of the dialog body (above the
Save/Cancel row, visually separated by a divider):

```tsx
{mode === "edit" && (
  <div className="mt-6 border-t border-border pt-4">
    {!confirmingDelete ? (
      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        className="text-xs font-semibold text-danger-text transition-colors hover:underline"
      >
        Delete account
      </button>
    ) : (
      <div className="flex items-center gap-3">
        <span className="text-xs text-danger-text">This cannot be undone.</span>
        <button
          type="button"
          onClick={() => deleteMutation.mutate(userId!)}
          className="rounded-lg border border-danger-border bg-danger-bg px-3 py-1.5 text-xs font-semibold text-danger-text transition-colors hover:bg-danger-bg/80"
        >
          Confirm delete
        </button>
        <button
          type="button"
          onClick={() => setConfirmingDelete(false)}
          className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
        >
          Cancel
        </button>
      </div>
    )}
  </div>
)}
```

`deleteMutation`:

```tsx
const deleteMutation = useMutation({
  mutationFn: (id: string) => api.deleteUser(id),
  onSuccess: (_, id) => {
    if (getCurrentUserId() === id) setCurrentUserId(null);
    queryClient.invalidateQueries({ queryKey: ["users"] });
    onClose();
  },
});
```

(The `UserPicker`'s existing `useEffect` will pick the next available user or
fall to `null`; the auto-redirect in Step 7 handles `null + zero users`.)

---

## Step 6 — Header changes

In whichever file holds the shared `<Header>` (either `App.tsx` after the
Step 2 refactor or the new `frontend/src/components/Header.tsx`):

### 6.1 Add the "Users" text link

Place it between `UserPicker` and the "API docs" link in the right-hand
cluster on desktop, and inside the existing mobile right-cluster (where "API"
already lives):

```tsx
<Link
  to="/users"
  className={`rounded-lg px-2 py-1.5 text-xs transition-colors ${
    location.pathname === "/users" ? "text-ink" : "text-ink-subtle hover:text-ink-muted"
  }`}
>
  Users
</Link>
```

(Import `Link` and `useLocation` from `react-router-dom`.)

### 6.2 Make tab buttons route-aware

The Backlog / Board / Archive tab buttons must work from `/users` too. Wire
them through the `BoardViewContext` from Step 2 — clicking a tab calls
`setView(v)` (which writes to localStorage) and then `navigate("/")` if
`location.pathname !== "/"`. On `/`, behavior is unchanged.

The tab counts come from `useTasks` / `useArchivedTasks`. They already run on
mount of `AppShell` (or wherever you hoist them) so the counts populate
correctly on `/users` too.

---

## Step 7 — Auto-redirect on zero users

In `AppShell`, after `useUsers` resolves:

```tsx
const { data: users, isSuccess } = useUsers();
const location = useLocation();
const navigate = useNavigate();

useEffect(() => {
  if (!isSuccess) return;
  if (users && users.length === 0 && location.pathname !== "/users") {
    navigate("/users", { replace: true });
  }
}, [isSuccess, users, location.pathname, navigate]);
```

This runs once after the initial fetch and any time the user count drops to
zero (e.g. after self-delete with no other users). The `replace: true` avoids
back-button traps.

---

## Step 8 — `UserPicker` cleanup

File: [`frontend/src/components/UserPicker.tsx`](../../frontend/src/components/UserPicker.tsx).

Replace the file's exported function with:

```tsx
import { useEffect, useState } from "react";
import { getCurrentUserId, setCurrentUserId } from "../lib/user.js";
import { useUsers } from "../lib/queries.js";

export function UserPicker() {
  const { data: users = [], isLoading, isSuccess } = useUsers();
  const [current, setCurrent] = useState<string | null>(getCurrentUserId());

  useEffect(() => {
    if (!isSuccess) return;
    const valid = current !== null && users.some((u) => u.id === current);
    if (valid) return;
    const next = users[0]?.id ?? null;
    if (next === current) return;
    setCurrentUserId(next);
    setCurrent(next);
  }, [users, current, isSuccess]);

  if (isLoading) return <div className="text-xs text-ink-subtle">Loading…</div>;

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-ink-subtle sm:inline">Acting as</span>
      <select
        value={current ?? ""}
        onChange={(e) => {
          setCurrentUserId(e.target.value || null);
          setCurrent(e.target.value || null);
        }}
        className="max-w-[140px] rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-xs font-medium text-ink focus:border-border-focus focus:outline-none transition-colors"
      >
        <option value="" disabled>
          (none)
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.display_name}{u.kind === "agent" ? " (agent)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
```

Removed: `AvatarGlyph`, `creating`/`newId`/`newKind` state, `createMutation`,
`useMutation`/`useQueryClient`/`api` imports, the `+ Add identity` button, the
inline form, the avatar prefix on `<option>` text, and the `<AvatarGlyph>`
next to the current user.

Kept: "Acting as" label, the `<select>` with `(none)` placeholder, the
`(agent)` suffix.

---

## Step 9 — Verification

Run from the repo root (per the standing workflow):

```bash
npm test                                    # backend tests still pass (no backend changes)
cd backend && npm run typecheck && cd ..
cd frontend && npm run typecheck && cd ..
npm run build                               # full monorepo build
docker build -t fjord .            # production image
```

Then exercise manually with `npm run dev`:

1. **Fresh install** — `rm -rf backend/data && mkdir -p backend/data && npm run dev`.
   Visit `http://localhost:5173/` — should auto-redirect to `/users`. Empty grid
   with `+ New user` tile. Click it; create a user; land back on `/users` with
   one card; the new user is the current "Acting as" identity. Navigate to `/`
   and confirm the board renders normally.
2. **Seeded install** — `FJORD_SEED_USERS=alice:human,agent-coder:agent npm run dev`.
   Visit `/users`: see two cards. Only `alice`'s card (assuming `alice` is the
   default current user) has an "Edit" button and a "You" pill. Click Edit;
   change `display_name` and `bio`; save; card updates.
3. **Handle validation** — open Edit, set handle to `admin` → inline error,
   submit blocked. Set to `has spaces` → inline error. Set to a duplicate
   (manually create a second user first) → server 409 surfaces under the
   handle field.
4. **Avatar picker** — open Edit, click a tile → input updates and tile
   ring appears. Paste `https://example.com/x.png` → grid deselects, save,
   card renders the image.
5. **Self-delete** — open Edit on the current user; click "Delete account",
   then "Confirm delete". If other users exist, `UserPicker` jumps to the
   next; if none, redirect to `/users` empty state.
6. **Header navigation** — on `/users`, click the Backlog tab → land on `/`
   with backlog view. The "Users" link should highlight on `/users` and dim
   on `/`.
7. **Emoji removal** — confirm the `UserPicker` shows no emoji anywhere
   (neither next to the current user nor inside the `<option>` rows).

---

## Definition of done

- [ ] Branch created from `main` before any commits
- [ ] `react-router-dom` v6 installed; routes `/` and `/users` work
- [ ] `frontend/src/pages/BoardPage.tsx` and `frontend/src/pages/UsersPage.tsx` exist
- [ ] `App.tsx` no longer contains the board guts; just providers + router + shared header chrome + `<Toaster>`
- [ ] `UsersPage` renders responsive card grid + `+ New user` tile + skeleton loading
- [ ] `UserCard` shows avatar, `display_name`, `@handle`, `title`, `bio`, kind indicator (round/square + "bot"/"human"), "You" pill on current user, Edit button only on current user
- [ ] `UserFormDialog` handles create and edit with one component; avatar picker grid (30 emoji) + custom input; client-side validation for handle + avatar + display_name; server 409 surfaces under handle field
- [ ] Create mode generates `id = crypto.randomUUID()` and never shows it
- [ ] Self-delete with two-click confirm; localStorage current-user cleared if it was self
- [ ] Header has a quiet "Users" link with active-state styling
- [ ] Board view tabs work from `/users` (navigate to `/` + persist view to localStorage)
- [ ] Auto-redirect to `/users` when `users.length === 0`
- [ ] `UserPicker` has no emoji rendering and no creation flow; just "Acting as" + select
- [ ] ADR-0003 committed
- [ ] CLAUDE.md updated: add a note that `/users` is the route to manage users and that user creation lives there
- [ ] All pre-PR checks pass (`npm test`, both typechecks, `npm run build`, `docker build`)
- [ ] PR body links the issue with "Resolves #59"
