# Space list page + space detail page

> Adds two new frontend pages — `/spaces` (card grid of accessible spaces) and `/spaces/:id` (a space's header, access list, and project/task tree) — plus a header link to reach them.

## Source

- GitHub issue: [#76 — Space detail page + space list page](https://github.com/johnmarcampbell/agentic_kanban/issues/76)
- Grilling session: alignment captured in this plan; no new ADRs.

## Context

The app today has a board (`/`), an archive view, a backlog view, a users page (`/users`), and a small `ManageSpacesDialog` reachable from the header. Spaces themselves are first-class on the backend — they have a name, description, owner (`created_by`), and per-space access grants — but the only browseable surface for them is the modal management dialog.

Issue #76 adds two real pages so a user can browse a space at a glance: a card grid listing accessible spaces, and a per-space detail page that shows the space's metadata, who has access, and the work inside it (projects expanded into task lists, with global sort controls).

This is a **UI-only** feature. All required data — spaces, access grants, projects, tasks, users — is already exposed by existing endpoints. See [CONTEXT.md](../../CONTEXT.md) for the meaning of "Space", "Space Owner", "Space access", "Role", and "Member" — the grilling pass pinned down a couple of UI labels that diverge from the issue text to stay consistent with that glossary (see Approach).

## Goals

1. A new `/spaces` route renders a card grid of every space the actor can access, mirroring the `/users` pattern, with a `+ New space` tile that opens a create dialog and navigates to the new space's detail page on success.
2. A new `/spaces/:id` route renders a detail page with: header (name, description, owner), "People with access" list, and a sorted/collapsible per-project task tree (plus a synthetic "No project" section).
3. The header gains a `Spaces` link next to the existing space switcher.
4. The Space Owner and any Admin can edit name and description inline on the detail page.
5. Task sort on the detail page supports two fields (progress, due date) and two directions (asc, desc) — applied globally to every project section on the page.
6. Access control is enforced via the existing API; Members navigating to a space they lack access to see a clean empty state instead of a generic error.

## Non-goals

1. No backend schema changes. No new endpoints. No new SSE event types.
2. No add/remove of space access from these pages — that flow remains in `ManageAccessDialog` reachable from `ManageSpacesDialog`.
3. No per-project sort controls — sort is global to the detail page.
4. No archive/unarchive controls on the new pages — those stay in `ManageSpacesDialog`.
5. No archived-task display on the detail page — archived tasks are excluded entirely. Status chips never show "Archived".
6. No task detail editing from the detail page — clicking a task opens the existing `TaskDrawer` (read/edit happens there as today).
7. No real-time space-metadata updates over SSE — if Admin A renames a space while Admin B is on its detail page, B sees the change on next refetch (window focus / navigation), not instantly.
8. No archived-space inclusion on the `/spaces` list page — list shows active spaces only. Direct deep links to archived spaces still render the detail page (with an "archived" badge).
9. No individual user profile route — owner / access-list entries render as avatar + @handle, non-clickable.

## Relevant prior decisions

- [ADR-0003 — User creation on users page](../adr/0003-user-creation-on-users-page.md) — establishes the card-grid + `+ New` tile pattern this plan mirrors for spaces.
- [ADR-0005 — Role column on users](../adr/0005-role-column-on-users.md) — defines `Admin` vs `Member`. Admins have implicit access to every space and are therefore **excluded** from the "People with access" list.
- [ADR-0007 — Open space creation and space owner](../adr/0007-open-space-creation-and-space-owner.md) — any user can create a space; creator becomes Space Owner with implicit access. The detail page reflects this: name/description are editable by Owner **or** Admin (matching `canManageSpace`), not by Admin only as the issue text suggests.

## Relevant files and code

### Frontend — to modify

- [frontend/src/App.tsx](../../frontend/src/App.tsx) — add `/spaces` and `/spaces/:id` routes (the catch-all `<Navigate to="/" replace />` currently swallows unknown paths; new routes go before it).
- [frontend/src/components/Header.tsx](../../frontend/src/components/Header.tsx) — add a `Spaces` link/button near the `SpaceSwitcher`; render it active on `/spaces` and `/spaces/:id`.
- [frontend/src/components/SpaceSwitcher.tsx](../../frontend/src/components/SpaceSwitcher.tsx) — when the user is on `/spaces/:id`, selecting a different space in the switcher should navigate to `/spaces/<new-id>` (mirroring "you're browsing a space's detail"). On any other route, keep current behavior.

### Frontend — to create

- `frontend/src/pages/SpacesPage.tsx` — new list page (mirrors [frontend/src/pages/UsersPage.tsx](../../frontend/src/pages/UsersPage.tsx)).
- `frontend/src/pages/SpaceDetailPage.tsx` — new detail page.
- `frontend/src/components/SpaceCard.tsx` — clickable card; mirrors [frontend/src/components/UserCard.tsx](../../frontend/src/components/UserCard.tsx).
- `frontend/src/components/NewSpaceDialog.tsx` — small name+description form; on success navigates to `/spaces/<new-id>`.
- `frontend/src/components/SpaceDetailHeader.tsx` — inline-editable name + description for managers, owner display.
- `frontend/src/components/SpaceAccessList.tsx` — renders avatar + @handle rows for owner + grants.
- `frontend/src/components/SpaceProjectTree.tsx` — sort controls + per-project collapsible sections + "No project" section.

### Frontend — to read (no changes expected)

- [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts) — `api.createSpace`, `api.updateSpace`, `api.listGrants` already exist (lines 87–106).
- [frontend/src/lib/queries.ts](../../frontend/src/lib/queries.ts) — `useSpaces`, `useUsers`, `useSpaceAccess` already exist.
- [frontend/src/lib/policy.ts](../../frontend/src/lib/policy.ts) — `isAdmin`, `canManageSpace`, `isSpaceOwner` already exist.
- [shared/src/index.ts](../../shared/src/index.ts) — `Space`, `Grant`, `Task`, `Project`, `User`, `DEFAULT_SPACE_ID`, `Column` types.
- [frontend/src/components/TaskDrawer.tsx](../../frontend/src/components/TaskDrawer.tsx) — opened on task-row click on the detail page.
- [frontend/src/components/ManageSpacesDialog.tsx](../../frontend/src/components/ManageSpacesDialog.tsx) — existing inline-rename pattern to mirror for the detail header (explicit Save/cancel, Enter to save, Esc to cancel).

### Backend — to read only (no changes)

- [backend/src/routes/spaces.ts](../../backend/src/routes/spaces.ts) — confirms permissions: `PATCH /api/spaces/:id` uses `canManageSpace` (Owner or Admin), `GET /api/spaces/:id/access` requires `canAccessSpace`.

### Demo seed — possibly modify

- [backend/demo/seed.sql](../../backend/demo/seed.sql) — audit and add the rows listed in [Demo seed data](#demo-seed-data) if missing.

## Approach

### Terminology — what the UI calls things

The issue uses "Members section" and "member count". `CONTEXT.md` reserves "Member" for the non-Admin global role and uses "Space access" for per-space grants and "Space Owner" for the creator. To stay consistent with the glossary:

- The issue's "Members section" is rendered as **"People with access"** in the UI.
- The card's "Member count" is rendered as **"N with access"** on each space card.

The list of people-with-access on the detail page is computed as: the Space Owner (badged "Owner") + every user with a `user_space_access` grant for this space. Admins are **excluded** — they have implicit access to every space, so listing them would be noise (and identical on every space).

The count on the list cards uses the same definition: `1 (owner) + grants.length`, excluding Admins.

### Who can edit name/description

The issue says "admins". The API allows Owner **or** Admin (`canManageSpace`). The plan follows the API: the inline-edit affordance shows for anyone where `canManageSpace(actor, space)` is true. Treat the issue's "admins" as informal shorthand.

Edit UX matches the existing rename pattern in `ManageSpacesDialog.tsx`: click to enter edit mode, explicit Save / cancel buttons, Enter saves the single-line name, Cmd/Ctrl+Enter saves the multi-line description, Esc cancels. Empty description renders as a clickable "Add a description…" placeholder for managers; renders as nothing for non-managers.

### Sort model

The sort control is **(field) × (direction)**:

- Field: `progress` | `due_date`
- Direction: `asc` | `desc`

Yielding four orderings. The sort applies globally to every project section on the page (and to "No project").

Progress order: `Backlog → To Do → In Progress → In Review → Done`. Archived tasks are not shown, so there is no "Archived" tier in the sort. Within the same column, tiebreak by `position` ascending, then `created_at` ascending.

Due-date order: tasks with `due_at = null` sort as +∞, so they are last in `asc` and first in `desc`. Tiebreak among same-due-date by `position` then `created_at`.

The 5 column-name status chips are the only ones rendered on task rows.

### Project sections

Each project in the space renders as a collapsible row, **collapsed by default**. Header shows project name + task count (e.g. "Auth refactor (3)"). Expanded view shows the sorted task list.

- **Empty projects (zero tasks)**: still rendered (collapsed) — projects are explicit first-class objects.
- **"No project" synthetic section**: at the bottom, same collapsible + sort behavior. **Hidden when empty** — it is a catch-all, not a first-class object.

### Data fetching

All data comes from existing endpoints and existing hooks. The detail page scopes per-space data via the optional `spaceId` parameter the hooks already accept (no client-side filtering needed):

- `GET /api/spaces/:id` — the space (no existing hook; add `api.getSpace(id)` + use `useQuery({ queryKey: ["space", id], queryFn: () => api.getSpace(id) })`)
- `GET /api/spaces/:id/access` — grants (via existing `useSpaceAccess(id)`)
- `GET /api/users` — for handle/avatar/role lookup (via existing `useUsers()`)
- `GET /api/projects?space_id=…` — via `useProjects(spaceId)` (already supports the arg)
- `GET /api/tasks?space_id=…` — via `useTasks(spaceId)` (already supports the arg; default excludes archived)

The list page uses `useSpaces()` (default `includeArchived: false`). The existing SSE subscription (`useStreamSubscription`) keeps the `tasks` query fresh, which is sufficient for live updates on the detail page. Space-metadata changes (rename, description edit, grant added/revoked by another actor) are not pushed over SSE; React Query's default refetch-on-window-focus is accepted as the staleness mitigation.

### Access control on the routes

- `/spaces`: renders whatever `GET /api/spaces` returns — already filtered by the backend to spaces the actor can access. Members see owned + granted spaces; Admins see all.
- `/spaces/:id`: if the API returns 403, render an empty state "You don't have access to this space." If 404, render "Space not found." (Catch `ApiError` from the wrapper.)

### Routing & nav

- Routes added in `App.tsx`: `/spaces`, `/spaces/:id`. Both rendered *before* the catch-all `<Navigate to="/" replace />`.
- `Header.tsx`: a `Spaces` link rendered near the `SpaceSwitcher`. Active styling when `location.pathname` starts with `/spaces`.
- `SpaceSwitcher.tsx`: detect when on `/spaces/:id` (via `useMatch("/spaces/:id")` or `useLocation`) and, in that case, change the switcher's selection handler to `navigate("/spaces/" + newSpaceId)` rather than its usual board-context switch.

### Create-space flow on the list page

`+ New space` tile (only rendered if the actor is allowed to create — per ADR-0007 that is **any** authenticated user, so the tile is shown for everyone except soft-deleted actors, which the auth gate already excludes). Opens `NewSpaceDialog`: name (required, 1–128) + description (optional). On success, navigate to `/spaces/<new-id>` and invalidate the `["spaces"]` query.

## Step-by-step plan

1. **Add the two routes.** Edit `frontend/src/App.tsx` to import `SpacesPage` and `SpaceDetailPage` and register `<Route path="/spaces" element={<SpacesPage />} />` and `<Route path="/spaces/:id" element={<SpaceDetailPage />} />` *before* the catch-all. Verify by typing `/spaces` in the URL bar after this step lands — it should render an empty page (not redirect to `/`).

2. **Add `Spaces` link in the header.** Edit `frontend/src/components/Header.tsx` to add a button/link to `/spaces` near the `SpaceSwitcher`. Render it with active styling when `location.pathname.startsWith("/spaces")`. Verify by clicking it and confirming the URL changes to `/spaces`.

3. **Create `SpaceCard.tsx`.** New file `frontend/src/components/SpaceCard.tsx`. Props: `space: Space`, `ownerHandle: string`, `withAccessCount: number`, `projectCount: number`. Renders the space name, `@ownerHandle`, "N with access", and `N projects`. The whole card is a clickable `Link` to `/spaces/<space.id>`. Mirror the visual structure of `UserCard.tsx`. No inline action buttons.

4. **Create `NewSpaceDialog.tsx`.** New file `frontend/src/components/NewSpaceDialog.tsx`. Form fields: name (required, trimmed, 1–128 chars; matches backend validation), description (optional, textarea). On submit calls `api.createSpace`, on success invalidates `["spaces"]` and navigates to `/spaces/<new-id>`. Error path: surface `ApiError.message` via `sonner`. Mirror `UserFormDialog`'s overlay/structure for visual consistency.

5. **Create `SpacesPage.tsx`.** New file `frontend/src/pages/SpacesPage.tsx`. Use `useSpaces()` (default `includeArchived: false`), `useUsers()`, and `useProjects()` (omit the `spaceId` arg to get all accessible projects — used for per-card project counts). For each space, compute owner display and counts:
    - `ownerHandle`: `users.find(u => u.id === space.created_by)?.handle ?? "unknown"`
    - `withAccessCount`: requires grants per space. **Implementation note:** rather than fetching `/api/spaces/:id/access` per card (N requests), accept a lightweight approximation for the card: show `1 + (grants this user has stored client-side for this space)`. Since there's no list-all-grants endpoint, fetch grants per space *only when* needed for a card, using `Promise.all` of `api.listGrants(s.id)` in a single `useQuery` keyed `["all-grants", spaceIds.join(",")]`. Acceptable because N is small (one-or-two-user setup).
    - `projectCount`: `projects.filter(p => p.space_id === space.id).length`
   Render a grid (same Tailwind classes as `UsersPage`) of `SpaceCard`s plus a `+ New space` tile that opens `NewSpaceDialog`. Skeleton on loading mirrors `UsersPage`'s.

6. **Create `SpaceDetailHeader.tsx`.** New file `frontend/src/components/SpaceDetailHeader.tsx`. Props: `space: Space`, `owner: User | undefined`, `canEdit: boolean`. Renders:
    - Name: large heading. If `canEdit`, click-to-edit (single-line input, Enter saves, Esc cancels, explicit Save/cancel buttons). On save calls `api.updateSpace(id, { name })`, invalidates `["space", id]` and `["spaces"]`.
    - Description: paragraph or `<em class="text-ink-subtle">Add a description…</em>` placeholder if empty. Same edit pattern but textarea, Cmd/Ctrl+Enter saves.
    - Owner: avatar + `@ownerHandle`, non-clickable. Label "Owner".
   Reuse the explicit Save/cancel pattern from `ManageSpacesDialog.tsx`'s `SpaceRow`.

7. **Create `SpaceAccessList.tsx`.** New file `frontend/src/components/SpaceAccessList.tsx`. Props: `space: Space`, `users: User[]`, `grants: Grant[]`. Computes the rendered list: the Space Owner (always first, badged "Owner") + each grant's user (in `granted_at` order). Skip soft-deleted users (display only fully active accounts here). Each row: avatar + `@handle`. No add/remove controls. Section heading: "People with access".

8. **Create `SpaceProjectTree.tsx`.** New file `frontend/src/components/SpaceProjectTree.tsx`. Props: `space: Space`, `projects: Project[]`, `tasks: Task[]`, `users: User[]`. Internal state:
    - `sortField: "progress" | "due_date"` (default `"progress"`)
    - `sortDir: "asc" | "desc"` (default `"asc"`)
    - `collapsed: Set<string>` keyed by `project.id` (or the literal `"__no_project__"`); all start collapsed.
   Sort comparator: switch on `sortField`. Progress uses a static rank table `{ Backlog: 0, "To Do": 1, "In Progress": 2, "In Review": 3, Done: 4 }`. Due date: `null` is treated as `Number.POSITIVE_INFINITY`. Direction is applied by negating the comparator result for `desc`. Tiebreak by `position`, then `created_at` (ISO string compare is fine — backend writes them with `nowIso`).
   Layout: top bar with the two toggles (a select for field, a button group for direction), then each project section (header row showing `project.name (count)`, clickable to toggle collapse, expanded body lists `TaskRow`s), then "No project" section (using `tasks.filter(t => t.project_id === null)`), hidden if empty. Empty projects (zero tasks) still render their collapsed header.

9. **Create `TaskRow` (inline in `SpaceProjectTree.tsx` or as a small co-located component).** Renders: title, status chip (`task.column`), assignee `@handle` (or "—" if unassigned). On click, opens the existing `TaskDrawer` (lift state up: `SpaceDetailPage` owns `openTaskId`; pass `onOpen` down). Reuse existing chip styles from `TaskCard.tsx` where reasonable to avoid restyling columns.

10. **Create `SpaceDetailPage.tsx`.** New file `frontend/src/pages/SpaceDetailPage.tsx`. Reads `:id` via `useParams`. Fetches:
    - Space via `useQuery({ queryKey: ["space", id], queryFn: () => api.getSpace(id) })`. `api.getSpace` does not exist today — add a one-line helper `getSpace: (id: string) => request<Space>(\`/api/spaces/${id}\`)` to `frontend/src/lib/api.ts`.
    - Grants via `useSpaceAccess(id)`.
    - Users via `useUsers()`. Projects via `useProjects(id)`. Tasks via `useTasks(id)` (already scope by `space_id`).
   Handle states:
    - Loading: skeleton.
    - 403 (ApiError with status 403): render "You don't have access to this space."
    - 404: render "Space not found."
    - Loaded: header → access list → project tree.
   Lift the open task drawer state here. Page layout matches `UsersPage`'s container: `<main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">`.

11. **Modify `SpaceSwitcher.tsx` for detail-page navigation.** Inside the switcher's onSelect, branch on `useMatch("/spaces/:id")`. If matched, `navigate("/spaces/" + selectedId)` instead of its current board-context switch. Otherwise keep existing behavior. Verify by navigating to `/spaces/<id>`, picking a different space in the switcher, and confirming the URL becomes `/spaces/<new-id>`.

12. **Audit and update `backend/demo/seed.sql`.** Run `grep -E "INSERT INTO (spaces|user_space_access|projects|tasks)" backend/demo/seed.sql` and verify:
    - At least one non-default space has a non-empty `description`. If not, edit one to add a sentence.
    - At least one non-default space has at least one `user_space_access` row pointing to a non-Admin user. If not, add one row.
    - At least one task has `project_id = NULL` in a non-default space. If not, edit one existing task in a non-default space to set `project_id = NULL` (or add a new row).
   Skip any of these sub-steps that already hold. Verify by running the app in demo mode and visiting `/spaces/<that-space>` — header description is visible, "People with access" has >1 row, "No project" section renders with at least one task.

13. **Manual smoke test.** Run `npm run dev` from the root. Walk through each of the flows listed in [Testing strategy](#testing-strategy) — at minimum the golden path for an Admin and the access-denied path for a Member.

14. **Typecheck and existing tests.** Run `npm run typecheck` in `frontend/` and `npm test` from root. Both must pass; no existing test should regress.

## Demo seed data

This is a UI-only feature, but the new pages surface state that the seed must actually contain for demo to show them off. The audit in step 12 ensures:

- A non-default space with a non-empty `description`
- A non-Admin grant on a non-default space (so "People with access" shows >1 row)
- A task with `project_id = NULL` in a non-default space (so "No project" section renders)

No new tables or columns; no entity types introduced.

## Testing strategy

No new automated tests are added — this is a pure-frontend feature and the app has no component or E2E test suite (per CLAUDE.md "No component/E2E tests"). Verification is manual + typecheck + existing backend tests.

### Manual checks (run from `/`)

Golden path — Admin:

- Click the new `Spaces` link in the header → URL becomes `/spaces`; card grid renders, including every seeded space.
- Each card shows name, `@owner-handle`, "N with access", "N projects". Hovering shows a click-through affordance.
- Click `+ New space` → dialog opens. Fill in name + description, submit → toast confirms, URL becomes `/spaces/<new-id>`, detail page renders.
- On detail page: click the space name → input becomes editable. Type a new name, hit Enter → name updates, edit mode exits.
- Click the description (or "Add a description…" placeholder) → textarea. Type, Cmd/Ctrl+Enter → saves.
- Owner row shows avatar + `@handle`.
- "People with access" includes the owner + each granted user, no admins.
- Sort controls: toggle field between progress and due-date, toggle direction asc/desc. Confirm task order changes as specified for all four combinations. Tasks with `due_at = null` go last in asc, first in desc.
- Expand and collapse each project section; counts in headers match expanded list lengths.
- "No project" section appears only when there's ≥1 project-less task; collapsible same as projects.
- Click any task row → existing `TaskDrawer` opens and works as today.

Golden path — Member (non-Admin, non-Owner of the target space, **with** a grant):

- `/spaces` shows only owned + granted spaces (not all).
- Navigate to a granted space's detail page → renders normally.
- Click space name → no edit affordance (cursor unchanged, no Save buttons).
- "People with access" includes them.

Access-denied path — Member without access:

- Navigate directly to `/spaces/<some-other-id>` → renders "You don't have access to this space." (Not an infinite spinner, not a toast error.)
- Navigate directly to `/spaces/nonexistent` → renders "Space not found."

Navigation interactions:

- On `/spaces/:id`, use the space switcher in the header to pick a different space → URL becomes `/spaces/<new-id>` and the page rerenders with the new space's data.
- On `/spaces/:id`, click the `Spaces` link in the header → returns to `/spaces`.
- On `/`, the space switcher still does its original board-context switch.

Live updates:

- Open `/spaces/<id>` in two browser windows as different users. In window A, create a task in that space. In window B, the project's task list updates within a few seconds (SSE → React Query invalidation).

Theme:

- Toggle theme; both pages respect dark mode.

### Regression risk

- Existing routes (`/`, `/users`, archived/backlog views) must continue to work — `App.tsx` route order change.
- `SpaceSwitcher` behavior on the board route must be unchanged — only `/spaces/:id` selection is redirected.
- `Header` layout must not shift on existing routes when the `Spaces` link is added.

### Typecheck & backend tests

```
npm run typecheck     # frontend & backend
npm test              # backend tests (existing)
```

Both must remain green.

## Acceptance criteria

- [ ] `/spaces` renders a card grid mirroring `/users`, with `+ New space` tile and clickable cards.
- [ ] Space cards show name, `@owner-handle`, "N with access" (= 1 + grant count, Admins excluded), and project count.
- [ ] `/spaces/:id` renders header (name, description, owner with avatar + @handle), "People with access" section, and a project tree.
- [ ] Name and description are inline-editable by Admins and the Space Owner (`canManageSpace`); not by anyone else.
- [ ] Inline edits use explicit Save / cancel; Enter saves the name, Cmd/Ctrl+Enter saves the description, Esc cancels.
- [ ] Empty description renders as an "Add a description…" placeholder for managers and as nothing for non-managers.
- [ ] "People with access" lists the Space Owner (badged "Owner") + every granted user (Admins not listed).
- [ ] Sort controls offer (field × direction) — progress/due-date × asc/desc — applied globally.
- [ ] Progress order: Backlog → To Do → In Progress → In Review → Done; tiebreak by position then `created_at`.
- [ ] Due-date order: null sorts as +∞ (last asc, first desc).
- [ ] Archived tasks are not displayed on the detail page; status chips only render the 5 column values.
- [ ] Projects render as collapsible sections, collapsed by default, showing `name (count)`.
- [ ] Empty projects still render (collapsed). "No project" section is hidden when empty.
- [ ] Header has a `Spaces` link active on `/spaces` and `/spaces/:id`.
- [ ] On `/spaces/:id`, the space switcher navigates to `/spaces/<id>`; on other routes, switcher keeps existing behavior.
- [ ] 403 → "You don't have access to this space" empty state.
- [ ] 404 → "Space not found" empty state.
- [ ] `/spaces` excludes archived spaces; archived deep links still render with an "archived" badge in the header.
- [ ] Demo seed exercises non-empty description, non-Admin grant, and project-less task in a non-default space.
- [ ] All existing tests pass (`npm test` from root).
- [ ] Typechecks clean (`npm run typecheck` in both `backend/` and `frontend/`).

## Open questions

None — all design decisions resolved during grilling. One implementation choice intentionally left to the executor:

- **How to render the "archived" badge in `SpaceDetailHeader` for archived-space deep links.** Suggest reusing the small uppercase badge pattern from `ManageSpacesDialog.tsx` (`rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle`), but the visual treatment is at the executor's discretion.

## Out-of-band work

- A separate issue ([#80 — Add password authentication](https://github.com/johnmarcampbell/agentic_kanban/issues/80)) tracks adding real authentication. It is unrelated to this plan but may shift how `actor` identity is established in the future. Nothing in this plan depends on the outcome.
