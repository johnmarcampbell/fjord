# Implementation plan — Issue #58: Task detail page

> Add a dedicated `/tasks/:id` route that renders the full task editor, and reposition the existing `TaskDrawer` as a true "sneak peek" by trimming its editor surface to status-only changes. A new presentational component `TaskDetail` and a `useTaskEditor` hook are shared between the drawer and the page so they don't drift.

## Source

- GitHub issue: [#58 — Task detail: add modal and dedicated route alongside drawer](https://github.com/johnmarcampbell/agentic_kanban/issues/58)

**Deviation from the issue text:** the issue calls for three surfaces — drawer (peek), modal (in-context full view), and route (shareable full view). After grilling, the modal was dropped: once the route exists, "open as page" is just clicking the URL, and a separate modal would duplicate the page's content with a different shell. Two surfaces only:

- **Drawer** = sneak peek (over the board, no URL change), trimmed
- **`/tasks/:id` page** = full view (own route, shareable, deep-linkable)

A modal can be added later without disturbing this structure. No ADR — the decision is reversible.

## Context

The existing `TaskDrawer` ([frontend/src/components/TaskDrawer.tsx](../../frontend/src/components/TaskDrawer.tsx), 801 lines) is the only way to inspect a task in detail. It does double duty: a quick "what is this?" peek and a full editor (description editing, comment composer, journal composer, archive, delete, blocker add/remove, full event timeline with filter). The result is cluttered for casual reading and not suitable for substantial editing because it's a narrow right-anchored side panel.

This plan separates those jobs onto two distinct surfaces with one shared presentational component and one shared mutation hook, so the editor behavior (optimistic concurrency, 409 conflict handling, archive flow, etc.) lives in exactly one place.

Domain terms (`Task`, `Column`, `Blocker`, `Comment`, `Journal entry`, `Space`) are defined in [CONTEXT.md](../../CONTEXT.md) — no new domain terms are introduced.

## Goals

1. New route `/tasks/:id` renders a full task editor with the same capabilities as today's drawer plus more breathing room.
2. New presentational component `TaskDetail` is consumed by `TaskPage` (and could be consumed by a future modal without further refactor).
3. New hook `useTaskEditor(taskId)` owns all task mutation logic (update + version bumping, conflict state, comments, journal, blockers, archive, unarchive, delete) so the drawer and page can't drift.
4. The drawer is trimmed to a true sneak peek: only status / assignee / due / project are editable; description, blockers, tags, and timeline are read-only; comment/journal composers and archive/delete buttons are removed.
5. The drawer gets a `↗` "Open full view" affordance in its header that navigates to `/tasks/:id` and closes the drawer.
6. The page deep-links cleanly: visiting `/tasks/:id` from a cold tab works, including for archived tasks and tasks in non-active spaces.

## Non-goals

1. **No modal surface.** Deviation from the issue text, explained above.
2. **No keyboard shortcuts.** Not a repo idiom yet; the ↗ button is the only escalation affordance.
3. **No mobile-specific layout.** The page's two-column → single-column responsive collapse and the drawer's existing narrow form cover small screens.
4. **No `@mentions` rendering** (separate issue).
5. **No reporter-name resolution improvements.** The drawer currently displays the raw `reported_by` user ID; the page will display the same. Fixing this is out of scope.
6. **No deep linking from notifications.** Issue mentions this, but there are no notifications yet — the route just needs to work as a shareable URL.
7. **No removal of the drawer.** It remains the at-a-glance flow.
8. **No backend changes.** Existing GET / PATCH / POST endpoints are sufficient.
9. **No component or E2E tests.** Per repo convention; manual verification only.
10. **No demo seed changes.** The seed already exercises tasks with blockers, comments, journal entries, archived state, and multiple spaces — enough to demo the new page without modification.

## Relevant prior decisions

- [CLAUDE.md](../../CLAUDE.md) — monorepo conventions, optimistic concurrency on tasks (`version` field required on PATCH), no auth (X-User-Id header), `pages/` directory holds route components.
- [CONTEXT.md](../../CONTEXT.md) — domain glossary; no new terms needed.
- [ADR-0003 — User creation on /users page](../adr/0003-user-creation-on-users-page.md) — establishes the pattern of `pages/<Thing>Page.tsx` for route components and shared dialogs in `components/`.
- [docs/plans/issue-59-user-view-page.md](issue-59-user-view-page.md) — the most recent comparable frontend plan; useful precedent for `pages/` layout and "verify manually" testing.
- No new ADRs created with this plan. The drawer-trim and the no-modal decisions are reversible.

## Relevant files and code

Read these before editing:

- [frontend/src/App.tsx](../../frontend/src/App.tsx) — router setup; new `<Route path="/tasks/:id">` lands here.
- [frontend/src/pages/BoardPage.tsx](../../frontend/src/pages/BoardPage.tsx) — current drawer entry point; passes `allTasks` and `onOpenTask` into the drawer.
- [frontend/src/components/TaskDrawer.tsx](../../frontend/src/components/TaskDrawer.tsx) — 801 lines, source of truth for current editor behavior. Will be trimmed.
- [frontend/src/lib/queries.ts](../../frontend/src/lib/queries.ts) — `useTasks`, `useTaskEvents` already exist; the page consumes both.
- [frontend/src/lib/mutations.ts](../../frontend/src/lib/mutations.ts) — `useUpdateTask`, `useDeleteTask`, `useAddComment`, `useAddJournalEntry`, `useAddBlocker`, `useRemoveBlocker`, `useArchiveTask`, `useUnarchiveTask` — `useTaskEditor` composes these.
- [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts) — fetch wrapper used by mutations; no changes.
- [frontend/src/lib/SpaceContext.tsx](../../frontend/src/lib/SpaceContext.tsx) — active-space provider; the page does **not** auto-switch active space on deep-link.
- [frontend/src/lib/stream.ts](../../frontend/src/lib/stream.ts) — SSE subscription; already invalidates relevant queries on `task.updated` / `task.deleted` so the page picks up live updates without extra wiring.
- [frontend/src/components/NewTaskDialog.tsx](../../frontend/src/components/NewTaskDialog.tsx) — visual reference for centered overlay styling (not directly reused; useful for matching tone).
- [frontend/src/components/UserFormDialog.tsx](../../frontend/src/components/UserFormDialog.tsx) — visual reference for the "destructive action at the bottom" pattern (delete button styling).
- [frontend/src/components/DateTimePicker.tsx](../../frontend/src/components/DateTimePicker.tsx), `Combobox.tsx` — leaf inputs reused inside `TaskDetail`.

## Approach

### Surfaces and ownership

| Surface | File | Role | Editable? |
|---|---|---|---|
| `TaskDrawer` | `components/TaskDrawer.tsx` (trimmed) | Sneak peek, over the board | Status, assignee, due, project only |
| `TaskDetail` | `components/TaskDetail.tsx` (new) | Full editor, presentational only | Everything |
| `TaskPage` | `pages/TaskPage.tsx` (new) | Route wrapper at `/tasks/:id` | Wraps `TaskDetail` + page chrome |
| `useTaskEditor` | `lib/useTaskEditor.ts` (new) | All mutation logic + conflict state | — |

`useTaskEditor` is the choke point. Both the trimmed drawer and `TaskDetail` consume it. It internalizes the current `version` so callers never pass it. Draft state (in-progress title edits, description buffer, composer input strings) stays in the *presentational* components — that's view-local and would only confuse the hook.

```
        ┌─────────────────────┐
        │  useTaskEditor(id)  │  ← owns: task, events, conflict, all mutations
        └──────────┬──────────┘
                   │
        ┌──────────┴──────────┐
        ▼                     ▼
   TaskDrawer            TaskDetail
   (peek, trimmed)       (full editor)
                              │
                              ▼
                          TaskPage
                          ( /tasks/:id )
```

### Drawer trim (what changes)

| Drawer section today | After trim |
|---|---|
| Title (inline-editable input) | **Read-only** text |
| Status / Assignee / Due / Project | **Keep editable** — the quick actions |
| Tags | **Read-only** chips |
| Description | **Render-only** markdown, max ~6 lines, fade-out overflow |
| Blocked by / Blocking | **Read-only** chips, no add/remove |
| Comments composer | **Removed** |
| Journal composer | **Removed** |
| Timeline w/ filter (`TimelineFilter`) | **Removed entirely** — replace with a one-line summary: e.g. "3 comments · 2 journal entries · 4 events" |
| Archive button | **Removed** |
| Delete button | **Removed** |
| 409 conflict banner | **Kept** for the remaining editable fields |
| Drawer header | **Add ↗ button** left of the close X, `aria-label="Open full view"`, tooltip "Open full view" |

Blocker chips remain clickable. **Click behavior unchanged: opens the drawer on the clicked blocker task** (lateral peek). This includes clicks from inside `TaskDetail` on the page — blocker chips open the *drawer*, not navigate to a new page. The drawer becomes the universal "what is this related thing?" peek surface.

### Page (`/tasks/:id`) layout

- Full app header (logo, view tabs, space switcher, "New task", theme, user picker) — unchanged from rest of app.
- A visible **"← Board"** link top-left of the page content. Always navigates to `/` (not `navigate(-1)`) — robust to arriving from a notification.
- Centered, `max-w-[880px]`, padded.
- Two-column layout at `lg:` and up; stacks to single column below. Left column: title, description, blockers, timeline (with composers). Right column (`lg:w-[280px]`): metadata fields (status, assignee, reporter, due, project, tags), then an **Archive / Unarchive** button, then at the very bottom a danger-styled **Delete** button (matches `UserFormDialog`'s destructive pattern, two-click confirm).
- `document.title` set to `${task.title} · agentic-kanban` on mount; restored on unmount.

### Edge cases

| Case | Behavior |
|---|---|
| Cold visit to `/tasks/abc` (task exists, in active space) | Renders normally. |
| Cold visit, task is in a non-active space the actor has access to | Renders normally. **Do not auto-switch** active space; "← Board" returns to whatever board was active before. |
| 404 (task doesn't exist) | Inline error card: "Task not found." + `← Board` link. No auto-redirect. |
| 403 (Member without space access) | Inline error card: "You don't have access to this task." + `← Board` link. |
| Archived task | Page renders; column select is disabled (matches drawer); the action button reads "Unarchive" instead of "Archive". |
| Deleted while viewing (SSE `task.deleted`) | Toast "This task was deleted" + `navigate("/")`. |
| Stale write (409 from PATCH) | `useTaskEditor` surfaces `conflict` string; the page shows a banner above the editor, same as the drawer does today. React Query re-fetch is triggered by the existing mutation hook's invalidation logic. |
| Blocker chip click | Opens the **drawer** on the blocker (even when clicked from `TaskPage`). Page itself is unaffected. |

### Data flow

- `TaskPage` calls `useTaskEditor(idFromRoute)` for the task + events + mutations.
- `TaskPage` calls `useTasks(task?.space_id)` for blocker title resolution. Same keying as the board, so the cache is shared.
- No new API client methods. Reuses `api.getTask`, `api.listEvents`, and all existing mutation hooks.

## Step-by-step plan

### Phase 1 — Extract mutation logic into `useTaskEditor`

1. **Create `frontend/src/lib/useTaskEditor.ts`.** A new hook with the signature below. It composes the existing `useQuery` for the task, `useTaskEvents` for events, and all the mutations in `lib/mutations.ts`. It owns a `conflict: string | null` state, set by the existing `onConflict` callback on `useUpdateTask` and cleared on successful follow-up updates. The hook's `update(patch)` reads the current `task.version` from its own cached task and forwards to `useUpdateTask`'s mutation — callers never pass `version`.

   ```ts
   export function useTaskEditor(taskId: string | null): {
     task: Task | undefined;
     events: TaskEvent[];
     isLoading: boolean;
     conflict: string | null;
     clearConflict: () => void;
     update: (patch: Omit<UpdateTaskRequest, "version">) => void;
     addComment: (body: string) => void;
     addJournal: (body: string) => void;
     addBlocker: (blockerId: string) => void;
     removeBlocker: (blockerId: string) => void;
     archive: (opts?: { onSuccess?: () => void }) => void;
     unarchive: (opts?: { onSuccess?: () => void }) => void;
     delete: (opts?: { onSuccess?: () => void }) => void;
   }
   ```

   When `taskId` is `null`, the hook returns an inert shape (task undefined, all mutations no-op). This lets `TaskPage` call it before `useParams()` is resolved.

   Verify: file compiles via `npm run typecheck` in `frontend/`.

2. **Refactor `TaskDrawer` to consume `useTaskEditor`.** Remove the in-file mutation declarations and the `conflict` state; replace with destructured fields from the hook. Keep all draft state (`draftTitle`, `draftDesc`, `comment`, `journal`, `editingDesc`, `timelineFilter`) in the component — these are view-local. The drawer still works identically at this point (no UI changes yet).

   Verify: `npm run dev`, open a task in the drawer, edit title / column / assignee / description, add a comment, add a journal entry, add and remove a blocker, archive — all still work. Verify the 409 banner still appears when forcing a stale-version write.

### Phase 2 — Add the route and shared presentational component

3. **Create `frontend/src/components/TaskDetail.tsx`.** A new presentational component, no layout chrome of its own (just the task editor body). Accepts `{ taskId: string }` as the sole prop. Internally:
   - Calls `useTaskEditor(taskId)`.
   - Calls `useTasks(task?.space_id)` for `allTasks` (blocker title resolution).
   - Calls `useUsers()`, `useProjects(task?.space_id)`.
   - Renders, top-down:
     - Title (inline editable, full size — matches the drawer's input idiom but at `text-2xl font-bold`)
     - Conflict banner (if `conflict !== null`)
     - **Two-column grid** (`lg:grid-cols-[1fr_280px]`, single column below):
       - **Left:** Description (editable markdown with preview/edit toggle), Blockers section (add + remove + chips, identical to drawer's pre-trim behavior), Timeline (filter buttons + event list), Comment composer, Journal composer.
       - **Right:** Status (`<select>`), Assignee (`<select>`), Reporter (read-only text), Due (`DateTimePicker`), Project (`<select>`), Tags (`TagInput`), Archive/Unarchive button, Delete button (danger, two-click confirm).
   - Blocker chip click invokes a prop `onOpenBlockerInDrawer: (id: string) => void` so the parent (the page) can hoist drawer state.
   - **Implementation note:** the simplest path is to physically *move* the existing JSX blocks from `TaskDrawer.tsx` into `TaskDetail.tsx`, then re-import the trimmed subset back into the drawer in Phase 3. Keep helper components (`Field`, `SectionLabel`, `TagInput`) co-located in `TaskDetail.tsx` and have `TaskDrawer` import them from there.

   Verify: file compiles. No route wires it in yet.

4. **Create `frontend/src/pages/TaskPage.tsx`.** A new route component that:
   - Reads `id` from `useParams<{ id: string }>()`.
   - Calls `useTaskEditor(id)` only to gate on `isLoading` / not-found / no-access. (Yes, this calls the hook twice — once here for gating, once inside `TaskDetail`. The hook is cheap because the underlying `useQuery` deduplicates.)
   - Manages local state for the drawer (`openBlockerId: string | null`) so blocker chip clicks open the drawer over the page. Renders `<TaskDrawer>` when set.
   - Sets `document.title = \`${task.title} · agentic-kanban\`` in a `useEffect`; restores prior title on unmount.
   - Renders error states:
     - Loading: `<div className="text-sm text-ink-subtle">Loading…</div>` inside the page shell.
     - 404 (API error status `404`): inline card "Task not found." + `← Board` link.
     - 403 (API error status `403`): inline card "You don't have access to this task." + `← Board` link.
   - On `task.deleted` SSE → React Query refetches and returns 404 → page renders the 404 state. To get the *toast* described in the design, watch for the task's existence transitioning from "loaded" to "undefined" inside a `useEffect`: if it was loaded then becomes undefined while the query is not loading, fire `toast.success("This task was deleted")` and `navigate("/")`.
   - Layout: `<main className="flex-1 overflow-y-auto"><div className="mx-auto max-w-[880px] px-6 py-6"><Link to="/" className="…">← Board</Link><TaskDetail taskId={id} onOpenBlockerInDrawer={setOpenBlockerId} /></div></main>` plus `<TaskDrawer …>` when open.

   Verify: file compiles.

5. **Wire the route in `App.tsx`.** Add a new `<Route path="/tasks/:id" element={<TaskPage />} />` inside the existing `<Routes>` in `AppShell`. Place it before the catch-all `<Route path="*" element={<Navigate to="/" replace />} />`.

   Verify: `npm run dev`, visit `http://localhost:5173/tasks/<existing-task-id>`. Page renders with full editor.

### Phase 3 — Trim the drawer

6. **Strip editable affordances from `TaskDrawer.tsx`.** Apply the trim from the table in "Drawer trim" above:
   - Title: replace `<input>` with a static `<h2>`/`<div>` rendering `task.title`.
   - Description: remove the edit toggle, the `<textarea>`, the save/cancel buttons. Render markdown only. Wrap in a `max-h-32 overflow-hidden relative` with a bottom fade-out (e.g. `after:bg-gradient-to-t after:from-surface after:to-transparent`).
   - Blockers: remove the `add blocker` row and the per-chip remove button. Chips are still clickable to swap the drawer to another task.
   - Tags: remove `TagInput`, render `task.tags` as read-only chips.
   - Comments / Journal composer: delete the `<textarea>` blocks and their submit buttons.
   - Timeline: delete the entire timeline section (filter buttons + event list). Replace with a single-line summary derived from `events`: count of `comment`, `journal_entry`, and everything else. E.g. `<div className="mt-4 text-xs text-ink-subtle">3 comments · 2 journal entries · 4 events</div>`. Pluralize correctly and omit a category if its count is 0.
   - Archive / Delete buttons: remove.
   - 409 banner: keep (still applies to the four editable fields).
   - Conflict / archive confirm state: keep only `conflict`. Remove `showArchiveConfirm`.
   - Hook usage: still calls `useTaskEditor` from Phase 1; calls to `addComment`, `addJournal`, `addBlocker`, `removeBlocker`, `archive`, `delete` are no longer invoked from the drawer. (The hook still exposes them — the drawer just doesn't use them. Don't refactor the hook to a smaller surface; both the page and the drawer should call the same hook.)

   Verify: `npm run dev`, open a task in the drawer. The four metadata selects still work. Description renders as markdown (read-only) with fade. Blocker chips visible and clickable (swap to the clicked task). Tags visible. Composer / timeline / archive / delete are gone. Timeline summary line shows correct counts.

7. **Add the ↗ "Open full view" affordance.** In the drawer header, left of the existing close X button, add a button:

   ```tsx
   <button
     onClick={() => { onClose(); navigate(`/tasks/${task.id}`); }}
     className="mt-0.5 flex-shrink-0 rounded-lg p-1 text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink"
     aria-label="Open full view"
     title="Open full view"
   >
     <svg width="14" height="14" viewBox="0 0 24 24" …>↗</svg>
   </button>
   ```

   Use a real inline SVG (e.g., `<path d="M7 17L17 7M17 7H8M17 7V16"/>`) matching the close-X button's stroke style. Tooltip uses native `title` (matches existing patterns).

   The drawer doesn't currently receive `navigate`. Either:
   - (a) Add `useNavigate()` directly inside `TaskDrawer`, since it's always rendered inside `<BrowserRouter>`.
   - (b) Accept a new `onOpenFullView: () => void` prop and let the parent (`BoardPage`, `TaskPage`) decide.

   Use (a) — it's local to the drawer and doesn't add a prop every caller has to plumb.

   Verify: click the ↗ in the drawer → drawer closes, URL changes to `/tasks/<id>`, page renders.

### Phase 4 — Polish and verification

8. **Make blocker-chip clicks open the drawer everywhere.** In `BoardPage`: no change (already does this via `setOpenTaskId`). In `TaskPage`: confirm the `openBlockerId` state correctly opens `<TaskDrawer taskId={openBlockerId} …>` overlaid on the page. Clicking another blocker chip inside that drawer swaps the drawer to the next task (same idiom as today).

   Verify: from `/tasks/<id>` where the task has a blocker, click the blocker chip → drawer slides in over the page. Click another blocker chip in that drawer → drawer swaps.

9. **Update [CLAUDE.md](../../CLAUDE.md)** to mention the new route. Find the "Routes" subsection under "Frontend architecture" and add a bullet:

   ```
   - `/tasks/:id` — full task detail; shareable URL. The `TaskDrawer` is the at-a-glance peek and links here via the ↗ "Open full view" button.
   ```

10. **No demo seed changes.** The existing [backend/demo/seed.sql](../../backend/demo/seed.sql) already exercises tasks with descriptions, blockers, comments, journal entries, archived tasks, and tasks in multiple spaces — enough to demo every aspect of the new page. Verify by visiting `/tasks/<id>` for a seeded task with blockers and comments after `KANBAN_DEMO_MODE=true npm run dev`.

## Demo seed data

No seed changes. The feature is UI-only — no new tables, columns, entities, or relationships. The existing seed already includes the variety needed to demonstrate the page: tasks with markdown descriptions, blocker chains, comments, journal entries, archived tasks, and tasks in non-default spaces.

## Testing strategy

**No new automated tests.** Per repo convention (no component / E2E tests; backend has no changes here).

**Manual verification (run `npm run dev`):**

1. **Drawer trim — happy path.** Open any task via the board → drawer opens. Confirm:
   - Title is read-only text (not an input).
   - Description renders as markdown with fade-out if long; not editable.
   - Status / Assignee / Due / Project selects all work and persist.
   - Tags appear as read-only chips.
   - Blocker chips appear; clicking one swaps the drawer to that task.
   - Timeline summary line shows correct counts ("3 comments · 2 journal entries · 4 events", pluralized, zero-counts omitted).
   - No comment composer, no journal composer, no archive button, no delete button.
   - 409 conflict banner still appears if you force a stale write (open two browsers, edit status in both).
2. **Drawer → page.** Click the ↗ button → drawer closes, URL becomes `/tasks/<id>`, page renders with full editor.
3. **Page — full editor.** On `/tasks/<id>`:
   - Title is editable inline; saves on blur.
   - Description has edit/preview toggle and saves.
   - All metadata fields work and persist.
   - Add a comment → appears in timeline; SSE delivers to other connected clients.
   - Add a journal entry → same.
   - Add a blocker → cycle detection works (try a self-block; expect a clear error).
   - Remove a blocker → chip disappears.
   - Archive → button toggles to "Unarchive"; status select disables.
   - Unarchive → reverses.
   - Two-click Delete → task gone; redirects to `/`.
4. **Page — chrome.** Full app header visible. "← Board" link top-left always returns to `/`. Browser tab title shows `${task.title} · agentic-kanban`. Restoring the prior title on unmount: navigate away and confirm the tab title resets.
5. **Page — blocker drawer.** On the page, click a blocker chip → drawer overlays the page. Click another blocker chip inside that drawer → drawer swaps. Close drawer → page is intact underneath.
6. **Cold deep-link.** Open a new tab, paste `/tasks/<id>` for a task in a *non-active* space the user has access to. Page renders. Active space in the header is **not** changed. "← Board" returns to whatever board was active before.
7. **Cold deep-link — archived task.** Same as above but for an archived task. Page renders; "Unarchive" button visible.
8. **404.** Visit `/tasks/does-not-exist`. Inline "Task not found." card with `← Board` link. No redirect.
9. **403.** As a Member without access to a space, visit `/tasks/<id>` for a task in that space. Inline "You don't have access to this task." card.
10. **Deleted while viewing.** Open `/tasks/<id>` in one browser; delete the task from another. The page shows toast "This task was deleted" and redirects to `/`.
11. **Stale write on page.** Open `/tasks/<id>` in two browsers; edit description in browser A, then edit description in browser B without refreshing. Browser B shows the 409 conflict banner and re-fetches.
12. **Live updates on page.** Open `/tasks/<id>` in browser A. From browser B, add a comment to that task. Browser A's timeline shows the new comment without a manual refresh (via SSE → React Query invalidation).
13. **Regression — board.** Click a task on the board → drawer opens as before. Drag a card between columns → still works. All other board features unaffected.

**Pre-PR checks (per the standing workflow):**

```bash
npm test                                    # backend tests still pass (no backend changes)
cd backend && npm run typecheck && cd ..
cd frontend && npm run typecheck && cd ..
npm run build                               # full monorepo build
docker build -t agentic-kanban .            # production image
```

## Acceptance criteria

- [ ] Branch created from `main` before any commits (e.g., `feat/issue-58-task-detail-page`).
- [ ] `frontend/src/lib/useTaskEditor.ts` exists with the documented signature; both `TaskDrawer` and `TaskDetail` consume it.
- [ ] `frontend/src/components/TaskDetail.tsx` exists; contains all editable affordances (title, description, status, assignee, reporter, due, project, tags, blockers add/remove, comments composer, journal composer, full timeline with filter, archive/unarchive, delete).
- [ ] `frontend/src/pages/TaskPage.tsx` exists; renders `TaskDetail` inside a max-w-880 centered layout with a "← Board" link.
- [ ] `<Route path="/tasks/:id" element={<TaskPage />} />` is wired in `App.tsx` before the catch-all.
- [ ] `TaskDrawer` has been trimmed per the table above: title read-only, description render-only with fade, tags read-only chips, blockers read-only chips (clickable to swap), composers removed, timeline replaced with one-line summary, archive/delete removed.
- [ ] `TaskDrawer` header has a ↗ "Open full view" button (left of the close X) that closes the drawer and navigates to `/tasks/<id>`.
- [ ] Blocker chip clicks open the **drawer** on the blocker, both from the board and from `/tasks/:id`.
- [ ] `/tasks/:id` does **not** auto-switch the active space.
- [ ] 404 / 403 / archived / deleted-while-viewing edge cases behave as described.
- [ ] `document.title` updates on `/tasks/:id` and restores on unmount.
- [ ] [CLAUDE.md](../../CLAUDE.md) has the new `/tasks/:id` bullet under "Routes".
- [ ] No backend changes.
- [ ] No demo seed changes.
- [ ] `npm test` passes from root.
- [ ] `npm run typecheck` passes in both `backend/` and `frontend/`.
- [ ] `npm run build` succeeds.
- [ ] `docker build -t agentic-kanban .` succeeds.
- [ ] PR body contains "Resolves #58" and notes the no-modal deviation up front.

## Open questions

None — all design decisions resolved during grilling.

## Out-of-band work

- The drawer currently displays the raw `reported_by` user ID rather than the reporter's display name. This appears in `TaskDrawer.tsx` around the "Reporter" field; the same issue will be inherited by `TaskDetail` since this plan preserves drawer behavior verbatim before splitting. Out of scope here; worth a separate small issue if not already filed.
- A future modal surface could wrap `TaskDetail` with no further refactor (it's already presentational). Re-introducing the modal is a small additive change if the need ever arises.
- `@mentions` rendering (separate issue) will land inside `TaskDetail` when it ships, naturally inheriting through the comment/journal markdown render path.
