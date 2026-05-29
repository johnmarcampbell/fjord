# Project detail page (`/projects/:id`)

> Adds a full-page view for a Project, reachable from the Space detail page via a new ↗ button on each project row, so users can focus on one project's tasks without the rest of the space's content in view.

## Source

- GitHub issue: [#91 — Pages-first redesign: project page, drawer rethink](https://github.com/johnmarcampbell/agentic_kanban/issues/91)

## Context

The Space detail page (`/spaces/:id`) already shows a collapsible per-project task tree via `SpaceProjectTree`. As a space grows, this tree becomes noisy — all projects visible at once, no way to deep-link into a single project. Issue #91 is an umbrella for moving the app toward a pages-first model where full pages are the primary surface for working with a task/project/space.

**This plan covers sub-task 1 only: the project detail page.** Sub-task 2 (drawer redesign) is explicitly deferred until issue [#82 — Revamp the new task flow](https://github.com/johnmarcampbell/agentic_kanban/issues/82) lands, because #82 will change what (if anything) the drawer needs to do.

See [CONTEXT.md](../../CONTEXT.md) for the meaning of **Space**, **Project**, **Task**, **Space access**, and **Role**.

## Goals

1. A new `/projects/:id` route renders a project's name, description, and its tasks in the same row-style task list the Space page uses.
2. The project header (name + description) is inline-editable for any authenticated user who can load the page (see Approach for why).
3. Clicking a task row opens a `TaskDrawer` overlay (same interaction as the Space page).
4. The page has a back link (`← <space name>`) that navigates to `/spaces/:space_id`.
5. The task list has sort controls: field (`progress` | `due_date`) × direction (`asc` | `desc`).
6. Each project section header in `SpaceProjectTree` gains a ↗ icon button that navigates to `/projects/:id`.
7. `GET /api/projects/:id` is added to the backend so the page can load a single project without fetching the full list.

## Non-goals

1. **Drawer redesign (sub-task 2)** — not in scope; see issue #91 and issue #82.
2. **Changing the task-click behavior** — task rows still open `TaskDrawer` (pages-first for tasks is #82's territory).
3. **Archive/delete project controls** — the project page is read/edit for name and description only; no lifecycle management.
4. **Project creation from this page** — projects are created from the Space page.
5. **Backend schema changes** — no new tables or columns.
6. **Demo seed changes** — all seeded projects already have non-empty descriptions; no new rows are needed.

## Relevant prior decisions

- [docs/plans/space-pages.md](space-pages.md) — the Space detail page this plan mirrors; `SpaceProjectTree`, `SpaceDetailHeader`, and the `TaskDrawer`-on-task-click pattern all come from here.
- [ADR-0007 — Open space creation and space owner](../adr/0007-open-space-creation-and-space-owner.md) — any user can create a space and becomes the Space Owner.
- [ADR-0012 — Space access carries affiliation, not just permission](../adr/0012-space-access-carries-affiliation-not-just-permission.md) — space access is explicit for everyone; Admins have implicit access to every space regardless of affiliation rows.

## Relevant files and code

### Backend — to modify

- [`backend/src/routes/projects.ts`](../../backend/src/routes/projects.ts) — add `GET /api/projects/:id` before the existing `PATCH` handler. The pattern matches `PATCH` exactly: look up by id, 404 if missing, 403 if `!canAccessSpace(actor, row.spaceId)`, return `toProject(row)`. The `toProject` helper (line 19) and `canAccessSpace` import are already present.

### Backend — to modify (tests)

- [`backend/tests/spaces.test.ts`](../../backend/tests/spaces.test.ts) — existing project tests live here (not a dedicated `projects.test.ts`). Add a `describe("GET /api/projects/:id")` block covering: 200 for an accessible project, 404 for unknown id, 403 for a Member without space access.

### Frontend — to modify

- [`frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts) — add `getProject: (id: string) => request<Project>(\`/api/projects/${id}\`)` alongside the existing `listProjects`, `createProject`, `updateProject`, `deleteProject` methods.
- [`frontend/src/lib/queries.ts`](../../frontend/src/lib/queries.ts) — add `useProject(projectId: string | null | undefined)` hook (mirrors the existing `useSpace` hook at line 45).
- [`frontend/src/components/SpaceProjectTree.tsx`](../../frontend/src/components/SpaceProjectTree.tsx) — add a ↗ icon button inside each project section header (the full-width collapse-toggle `<button>`). The ↗ button calls `e.stopPropagation()` so it doesn't also toggle collapse, then `navigate(\`/projects/${section.key}\`)`. Hidden for the synthetic `NO_PROJECT_KEY` section. Import `useNavigate` from `react-router-dom`.
- [`frontend/src/App.tsx`](../../frontend/src/App.tsx) — add `<Route path="/projects/:id" element={<ProjectPage />} />` before the catch-all `<Navigate to="/" replace />`.

### Frontend — to create

- `frontend/src/pages/ProjectPage.tsx` — new page; see Approach for structure.

### Frontend — to read (no changes expected)

- [`frontend/src/components/SpaceDetailHeader.tsx`](../../frontend/src/components/SpaceDetailHeader.tsx) — the inline-edit UX pattern to mirror for the project header (name: click-to-edit, Enter saves, Esc cancels; description: click-to-edit, Cmd/Ctrl+Enter saves, Esc cancels; explicit Save/cancel buttons; "Add a description…" placeholder when empty and `canEdit`).
- [`frontend/src/components/TaskDrawer.tsx`](../../frontend/src/components/TaskDrawer.tsx) — the ↗ icon button SVG to copy for the project row (lines 81–103).
- [`frontend/src/pages/SpaceDetailPage.tsx`](../../frontend/src/pages/SpaceDetailPage.tsx) — the overall page structure and `openTaskId`/`TaskDrawer` pattern to mirror.
- [`frontend/src/lib/policy.ts`](../../frontend/src/lib/policy.ts) — `isAdmin`, `canManageSpace` helpers (not needed for `canEdit` on the project page; see Approach).

## Approach

### Backend: `GET /api/projects/:id`

The project page needs to load one project by id. The list endpoint (`GET /api/projects`) requires knowing the `space_id` in advance, which we don't have on first load. A dedicated `GET /api/projects/:id` is the clean solution — it mirrors the existing `PATCH` and `DELETE` shape exactly and is < 15 lines to add.

Permission check: `canAccessSpace(actor, row.spaceId)` — same as `PATCH`. Returns `toProject(row)` on success.

### Frontend: `ProjectPage`

Structure mirrors `SpaceDetailPage`:

```
ProjectPage (reads :id from useParams)
├── loads project via useProject(id)
├── loads space via useSpace(project.space_id)   ← for back-link name
├── loads tasks via useTasks(project.space_id)   ← then filters client-side to project_id === id
├── loads users via useUsers()                   ← for task row assignee display
├── renders ProjectHeader (inline-editable name + description)
├── renders ProjectTaskList (flat sorted task list + sort controls)
└── renders TaskDrawer when openTaskId is set
```

**No grants fetch is needed.** The `canEdit` decision for the project page simplifies cleanly: `PATCH /api/projects/:id` uses `canAccessSpace` — the same check as `GET /api/projects/:id`. Therefore, any user who successfully loads the project page already has write access. `canEdit` is always `true` for authenticated users on the project page. No `useSpaceAccess` call is needed here.

**Inline-edit UX** mirrors `SpaceDetailHeader` exactly:
- Name: large heading, click to enter edit mode, single-line `<input>`, `Enter`/submit saves, `Esc` cancels, explicit Save/cancel buttons, empty-string rejected.
- Description: paragraph or `"Add a description…"` placeholder. Click to enter edit mode, `<textarea>`, `Cmd/Ctrl+Enter` saves, `Esc` cancels.
- On save: call `api.updateProject(id, { name })` or `api.updateProject(id, { description })`. Invalidate `["project", id]` and `["projects", null]` (the unscoped list key).

**Task list** — sorted flat list (no project sections needed — this page *is* the project). Reuse the `comparator` logic from `SpaceProjectTree.tsx` (extract it or duplicate it locally). Sort controls: field (`progress` | `due_date`) × direction (`asc` | `desc`), same UI as `SpaceProjectTree`. Archived tasks excluded (filter on `!t.archived`).

**TaskRow** — same `TaskRow` component used in `SpaceProjectTree`. On click, set `openTaskId`; `ProjectPage` owns this state and renders `TaskDrawer` conditionally with `allTasks` scoped to the space.

**Back link** — `← <space.name>` rendered as a `Link` to `/spaces/:project.space_id`, mirroring `TaskPage`'s `← Board` link. Space name loaded from `useSpace(project.space_id)` (already has a hook). Renders `← Back` as a fallback while space is loading.

**Error states** — 404 ("Project not found"), 403 ("You don't have access to this project"), generic error — same pattern as `TaskPage` and `SpaceDetailPage`.

**Loading skeleton** — same shape as `SpaceDetailPage`'s `Skeleton`: a heading placeholder and a content-area placeholder.

### ↗ button in `SpaceProjectTree`

The existing project section header is a full-width `<button>` that toggles collapse. A ↗ icon button is nested inside it at the right edge. Clicking the ↗:
1. Calls `e.stopPropagation()` — prevents the collapse toggle from firing.
2. Calls `navigate(\`/projects/${section.key}\`)`.

The ↗ is not rendered for the synthetic `NO_PROJECT_KEY` section (it has no real project id to navigate to). Use the same SVG arrow-up-right from `TaskDrawer.tsx` (lines 91–103).

## Step-by-step plan

1. **Add `GET /api/projects/:id` to the backend.** In [`backend/src/routes/projects.ts`](../../backend/src/routes/projects.ts), add a new `app.get("/api/projects/:id", ...)` handler before the existing `app.patch(...)` at line 112. The handler: look up the row with `app.db.select().from(projects).where(eq(projects.id, id)).get()`, return 404 if missing, return 403 if `!canAccessSpace(actor, row.spaceId)`, return `toProject(row)`. All imports (`eq`, `canAccessSpace`, `projects`, `toProject`) are already present.

2. **Test the new endpoint.** In [`backend/tests/spaces.test.ts`](../../backend/tests/spaces.test.ts), add a `describe("GET /api/projects/:id")` block with three cases: (a) 200 + correct project shape for an accessible project, (b) 404 for an unknown id, (c) 403 for a Member actor without access to the project's space. Run `npm test` from root to confirm all pass.

3. **Add `api.getProject` to the frontend API client.** In [`frontend/src/lib/api.ts`](../../frontend/src/lib/api.ts), add `getProject: (id: string) => request<Project>(\`/api/projects/${id}\`)` alongside the other project methods.

4. **Add `useProject` hook.** In [`frontend/src/lib/queries.ts`](../../frontend/src/lib/queries.ts), add:
   ```ts
   export function useProject(projectId: string | null | undefined) {
     return useQuery({
       queryKey: ["project", projectId],
       queryFn: () => api.getProject(projectId!),
       enabled: !!projectId,
     });
   }
   ```

5. **Add the ↗ button to `SpaceProjectTree`.** In [`frontend/src/components/SpaceProjectTree.tsx`](../../frontend/src/components/SpaceProjectTree.tsx):
   - Import `useNavigate` from `react-router-dom`.
   - Call `const navigate = useNavigate()` inside `SpaceProjectTree`.
   - Inside the project section header `<button>`, after the task-count `<span>`, add a ↗ icon `<button>` that is only rendered when `section.key !== NO_PROJECT_KEY`. The button: `onClick={(e) => { e.stopPropagation(); navigate(\`/projects/${section.key}\`); }}`, `aria-label="Open project page"`, copy the SVG arrow-up-right from `TaskDrawer.tsx` lines 91–103 (14×14 viewport).
   - Verify by navigating to `/spaces/:id` in the browser and confirming each project header shows the ↗ and clicking it goes to `/projects/:id`.

6. **Create `ProjectPage.tsx`.** New file `frontend/src/pages/ProjectPage.tsx`. Structure:
   - `useParams<{ id: string }>()` for the project id.
   - `useProject(id)` for project data.
   - `useSpace(project?.space_id)` for back-link space name.
   - `useTasks(project?.space_id)` for all space tasks, filtered client-side to `t.project_id === id && !t.archived`.
   - `useUsers()` for assignee display.
   - `useState<string | null>(null)` for `openTaskId`.
   - Error states: 404, 403, generic (same pattern as `TaskPage`).
   - Loading skeleton.
   - Render: back link (`← <space.name>`) → project header (inline-editable name + description, `canEdit={true}`) → sort controls → flat `TaskRow` list → conditional `TaskDrawer`.
   - Inline-edit mutations call `api.updateProject(id, ...)` and invalidate `["project", id]` and `["projects", null]`.

7. **Register the route in `App.tsx`.** In [`frontend/src/App.tsx`](../../frontend/src/App.tsx), import `ProjectPage` and add `<Route path="/projects/:id" element={<ProjectPage />} />` before the catch-all `<Navigate to="/" replace />` (currently line 95). Verify by typing `/projects/<any-valid-id>` in the URL bar — it should render the project page.

8. **Typecheck and run tests.** Run `npm run typecheck` in `frontend/` and `npm test` from root. Both must pass with no regressions.

## Demo seed data

No changes needed. All five seeded projects ([`backend/demo/seed.sql`](../../backend/demo/seed.sql) lines 41–52) already have non-empty `description` values. The project page will show real content in demo mode without any new rows.

## Testing strategy

**Backend integration tests** (step 2 above, in `backend/tests/spaces.test.ts`):
- `GET /api/projects/:id` → 200 with correct shape for an accessible project.
- `GET /api/projects/:id` → 404 for unknown id.
- `GET /api/projects/:id` → 403 for a Member actor without space access.

**Manual checks** (no component/E2E test suite exists per CLAUDE.md):

Golden path:
- Visit `/spaces/:id` (any seeded space). Each project section header shows the ↗ button. Clicking ↗ navigates to `/projects/:id`.
- The project page renders: back link `← <space name>`, project name, project description, sort controls, task rows.
- Name is clickable → edit mode → type new name → Enter → saves → edit mode exits.
- Description is clickable → edit mode → type new description → Cmd/Ctrl+Enter → saves.
- "Add a description…" placeholder appears for a project with empty description.
- Sort controls: toggle field (progress / due date) and direction (asc / desc); confirm task order changes.
- Click any task row → `TaskDrawer` opens and works as today (editable, ↗ navigates to `/tasks/:id`).
- `← <space name>` link navigates back to `/spaces/:space_id`.

Error states:
- `/projects/nonexistent` → "Project not found."
- A Member without space access navigating directly to `/projects/<id-in-inaccessible-space>` → "You don't have access to this project."

Regression:
- `/spaces/:id` still works; the ↗ button does not interfere with the collapse toggle.
- Clicking the section header area (outside ↗) still collapses/expands as before.
- Existing routes (`/`, `/users`, `/spaces`, `/tasks/:id`) unaffected.

## Acceptance criteria

- [ ] `GET /api/projects/:id` returns 200 with project shape, 404 for unknown, 403 for inaccessible.
- [ ] Backend tests for all three cases pass (`npm test`).
- [ ] `api.getProject(id)` and `useProject(id)` exist in `api.ts` and `queries.ts`.
- [ ] Each real project section header in `SpaceProjectTree` shows a ↗ icon button.
- [ ] Clicking ↗ navigates to `/projects/:id` without toggling the collapse state.
- [ ] The synthetic "No project" section has no ↗ button.
- [ ] `/projects/:id` route is registered in `App.tsx`.
- [ ] Project page renders name, description, back link, sort controls, and task rows.
- [ ] Name and description are inline-editable (click to edit, Save/cancel, Enter/Cmd+Enter, Esc); empty description shows placeholder.
- [ ] Inline edits call `PATCH /api/projects/:id` and invalidate the project and projects queries.
- [ ] Task rows open a `TaskDrawer` on click.
- [ ] `← <space name>` back link navigates to `/spaces/:project.space_id`.
- [ ] Sort controls (progress/due-date × asc/desc) reorder the task list correctly.
- [ ] 404 and 403 render clean error states (no unhandled errors, no blank screen).
- [ ] All existing tests pass (`npm test` from root).
- [ ] Typechecks clean (`npm run typecheck` in `frontend/` and `backend/`).

## Open questions

None — all design decisions resolved during grilling.

## Out-of-band work

- **Issue #82 — New task flow as a full page** is blocked by this plan (its acceptance criteria include consistency with the project page shell). Once this plan merges, #82 can proceed.
- **Issue #91 sub-task 2 — Drawer redesign** remains open; it is explicitly deferred until #82 lands. Filing a follow-up issue or keeping it tracked on #91 is at the author's discretion.
