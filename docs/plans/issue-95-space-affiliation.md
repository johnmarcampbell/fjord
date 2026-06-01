# Admins as explicit participants in Spaces (decouple affiliation from permission)

> Make **Space access** rows mean "this User is in this Space" rather than "this Member is permitted in this Space", so **Admins** stop implicitly appearing in every space's member list, assignee picker, and event stream — without losing any of their administrative powers.

## Source

- GitHub issue: [#95 — Admins should be explicit members of spaces](https://github.com/johnmarcampbell/fjord/issues/95)
- New ADR drafted alongside this plan: [ADR-0012 — Space access carries affiliation, not just permission](../adr/0012-space-access-carries-affiliation-not-just-permission.md)

## Context

fjord already has a permissions model (see [ADR-0005](../adr/0005-role-column-on-users.md)): every **User** has a global **Role** (`Admin` or `Member`), and **Members** earn per-**Space** entry via rows in the `user_space_access` table. **Admins** bypass that table entirely — they have implicit access to every **Space**, which the auth layer represents with the sentinel `accessibleSpaceIds: "all"` on the resolved `Actor`.

That shortcut was convenient for permission resolution, but it has a social cost: in any space larger than a personal workspace, a **Member** cannot tell which **Admins** are *actually* collaborating in this space versus which **Admins** are merely operationally responsible for the install. Every **Admin** appears in every member list and every assignee picker, because there's no way to express "I am present here" separately from "I have permission here". The two ideas have been the same row.

This plan splits them. After this change a row in `user_space_access` is *affiliation* — an explicit "I am in this space" — and **Permission** continues to be derived from **Role** + **Owner** + the same rows. For a **Member**, the row still grants permission as a side effect; for an **Admin**, the row carries no new permission but is what causes them to appear in member lists, pickers, and the SSE event stream for that space.

Domain terms used here are defined in [CONTEXT.md](../../CONTEXT.md): **User**, **Role**, **Admin**, **Member**, **Space**, **Space access**, **Space Owner**, **Default Administrator**.

## Goals

1. The `Actor` decorated by auth middleware carries a new `affiliatedSpaceIds: Set<string>` field (always the explicit owned-or-granted set, never `"all"`), alongside the existing `accessibleSpaceIds: Set<string> | "all"` used for permission decisions.
2. `POST /api/spaces/:id/access` accepts an **Admin** as the target. The current `400 if user is Admin` guard is removed.
3. `GET /api/spaces/:id/access` returns the rows in `user_space_access` for that space — unchanged in shape, but it now legitimately includes **Admins** who have joined.
4. `GET /api/spaces` returns the same set of spaces it does today (all for **Admins**, owned-or-granted for **Members**) and each space object additionally carries `affiliated: boolean` indicating whether the requesting actor is "in" the space.
5. The SSE `/api/events/stream` endpoint filters events using `affiliatedSpaceIds` (not `accessibleSpaceIds`); silent filtering, no client-visible "filtered" marker.
6. The space-page assignee picker, the "Bring someone into this Space" combobox, and the "People in this Space" list all draw from `affiliatedSpaceIds` for the relevant space.
7. UI verbiage on the Space page changes: "People with access" → "People in this Space"; "Grant access to a Member…" → "Bring someone into this Space…"; the explanatory line "Admins already have access to all spaces and are excluded" is removed because **Admins** are now eligible candidates.
8. Code that used `accessibleSpaceIds === "all"` as an *Admin role check* (not as a permission-scope check) is replaced with `actor.role === "Admin"`.
9. The demo seed in [backend/demo/seed.sql](../../backend/demo/seed.sql) is updated so the seeded admin `alice` has at least one explicit grant row, exercising the new "Admin appears in People in this Space via an explicit row" path.

## Non-goals

1. **No change to who can do what.** Authorization predicates (`canAccessSpace`, `canManageSpace`, `canManageUsers`, `canEditUser`, `canDeleteUser`, `canGrantAccessForSpace`) keep their existing semantics. An **Admin** retains every power they have today on every space, joined or not.
2. **No migration backfill.** No data migration runs to seed historical affiliations. **Admins** continue to appear in spaces they own via the existing **Owner** implicit-access rule; anything else is a deliberate self-join after this ships.
3. **No self-leave for Members.** Members revoking *their own* grant via `DELETE /api/spaces/:id/access/:user_id` stays Owner-or-Admin only. A small follow-up issue can be filed; out of scope here.
4. **No subscription-model change for SSE.** The stream stays a single fan-out connection filtered server-side. The "Admin viewing a board they have not joined still gets live updates" variant (Q4-C in grilling) is intentionally not pursued — file a follow-up if the friction becomes a real complaint.
5. **No `@mentions` or notifications behavior** — those features do not exist yet. When they land, they should use `affiliatedSpaceIds`, but that is their plan's problem, not this one's.
6. **No new ADR for the Default Administrator case.** [ADR-0006](../adr/0006-default-administrator-user.md) already covers its invariants. This change does not give the **Default Administrator** any new carve-out — it joins spaces like any other **Admin**, and appears in `default` because it owns `default`.

## Relevant prior decisions

- [ADR-0005 — Add `role` column to `users`](../adr/0005-role-column-on-users.md): defines the two-tier `Admin`/`Member` model and locates per-space grants in a separate `user_space_access` table.
- [ADR-0006 — Default Administrator user](../adr/0006-default-administrator-user.md): the bootstrap **Default Administrator** (id `default-administrator`, handle `admin`) exists on every install. This plan does not special-case it.
- [ADR-0007 — Open space creation; introduce Space Owner](../adr/0007-open-space-creation-and-space-owner.md): any **User** can create a **Space** and becomes its **Space Owner**; Owners have implicit access via `spaces.created_by`. This plan keeps the Owner-implicit rule intact — "People in this Space" is `Owner ∪ grant rows`, not derived solely from `user_space_access`.
- [ADR-0008 — Password authentication](../adr/0008-password-authentication.md): describes the session-cookie and bearer-token auth paths whose middleware decorates the `Actor` object this plan extends.
- **ADR-0012 — Space access carries affiliation, not just permission** *(new, created with this plan)*: see [docs/adr/0012-space-access-carries-affiliation-not-just-permission.md](../adr/0012-space-access-carries-affiliation-not-just-permission.md). The conceptual core of this change.

## Relevant files and code

Backend:
- [backend/src/auth/actor.ts](../../backend/src/auth/actor.ts) — `Actor` interface (line 8), `loadActor` (line 62) which computes `accessibleSpaceIds` and where `affiliatedSpaceIds` will be computed in parallel.
- [backend/src/auth/policy.ts](../../backend/src/auth/policy.ts) — `canAccessSpace`, `canManageSpace`, `canManageUsers`, `canEditUser`, `canDeleteUser`; the latter three use the `=== "all"` sentinel as an Admin-check proxy and should be rewritten in terms of `actor.role`.
- [backend/src/routes/spaces.ts](../../backend/src/routes/spaces.ts) — `GET /api/spaces` filter (line 50), and the `POST /api/spaces/:id/access` Admin-rejection guard at line 302.
- [backend/src/routes/stream.ts](../../backend/src/routes/stream.ts) — SSE subscriber filter at line 21, currently reads `accessibleSpaceIds`.
- [backend/src/routes/tokens.ts](../../backend/src/routes/tokens.ts) — three Admin checks at lines 51, 110, 141, currently `accessibleSpaceIds === "all"`.
- [backend/src/db/schema.ts:150](../../backend/src/db/schema.ts) — `userSpaceAccess` table; no schema changes required.
- [backend/demo/seed.sql:362](../../backend/demo/seed.sql) — existing `user_space_access` seed; needs an admin row added.

Shared:
- [shared/src/index.ts](../../shared/src/index.ts) — `Space` type definition; gains an `affiliated: boolean` field.

Frontend:
- [frontend/src/components/SpaceAccessList.tsx](../../frontend/src/components/SpaceAccessList.tsx) — the existing "People with access" / "Grant access to a Member…" section; main user-facing surface for the verbiage change and the candidates filter (line 71 excludes Admins today).
- [frontend/src/components/SpaceDetailHeader.tsx](../../frontend/src/components/SpaceDetailHeader.tsx) — space page header; will host a new "Join this Space" affordance for non-affiliated actors.
- [frontend/src/pages/SpaceDetailPage.tsx](../../frontend/src/pages/SpaceDetailPage.tsx) — composes the header + access list; consumes the new `affiliated` flag.
- [frontend/src/components/SpaceCard.tsx](../../frontend/src/components/SpaceCard.tsx) — space cards on `/spaces`; opportunity to render an affiliation badge.
- [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts) — `grantSpaceAccess`, `revokeSpaceAccess` clients; no signature changes.

Tests:
- [backend/tests/](../../backend/tests/) — add a new `space_affiliation.test.ts` covering the policy/listing differences between **Admins** and **Members**.

## Approach

The model change is small but ripples across the auth layer, the spaces routes, the SSE stream, and a handful of UI surfaces. The shape:

**1. Split the `Actor` into permission-scope and affiliation-scope.**
The single `accessibleSpaceIds` field has been doing two jobs — answering "what can this actor act on?" and "what is this actor part of?". After this plan, those answers diverge for **Admins**. The cleanest separation is to introduce a sibling field on `Actor`:

```ts
export interface Actor {
  id: string;
  role: Role;
  /** What the actor has permission to access — "all" for Admins. */
  accessibleSpaceIds: Set<string> | "all";
  /** What the actor explicitly belongs to (owned + granted). Never "all". */
  affiliatedSpaceIds: Set<string>;
  // ...unchanged below
}
```

For a **Member**, `affiliatedSpaceIds === accessibleSpaceIds` (both are the same `Set`). For an **Admin**, `accessibleSpaceIds = "all"` but `affiliatedSpaceIds` is the same owned+granted `Set` we already compute for Members. `loadActor` simply computes the Set unconditionally (whether or not the role is Admin), then layers the sentinel only on `accessibleSpaceIds` for Admins.

**2. Replace `accessibleSpaceIds === "all"` as a role check.**
Several call sites today use the sentinel as a proxy for "is this user an Admin?" — `canManageUsers`, `canEditUser`, `canDeleteUser`, the three token-route checks. With `actor.role` available, those should switch to `actor.role === "Admin"` for legibility. The sentinel comparisons inside genuine permission predicates (`canAccessSpace`, `canManageSpace`) stay — they really are about permission scope.

**3. Filter UI-facing surfaces by affiliation.**
The endpoints whose semantics shift:

- `GET /api/spaces` keeps its existing visibility rule but each space object gains `affiliated: boolean` — true iff the requesting actor's `affiliatedSpaceIds` contains the space id, or the actor owns it. The frontend uses this to render "Spaces you're in" prominently and to flag others.
- `GET /api/spaces/:id/access` is unchanged in implementation — it has always returned grant rows from `user_space_access`. The change is that those rows can now belong to **Admins**.
- `POST /api/spaces/:id/access` drops the line that rejects Admins.
- `GET /api/events/stream` swaps `accessibleSpaceIds` for `affiliatedSpaceIds` in its filter.

There is no new endpoint. The pickers and member lists in the frontend already query `GET /api/spaces/:id/access` and `GET /api/users`; their filtering logic moves from "exclude Admins" to "intersect with `affiliated` set".

**4. Owner stays implicit.**
A **Space Owner** is identified by `spaces.created_by` and continues to have implicit access without holding a grant row. "People in this Space" in the UI is `Owner ∪ grants` — meaning the Owner section is rendered separately at the top (existing behaviour in `SpaceDetailHeader`) and the rest of the list comes from `GET /api/spaces/:id/access` rows. No data backfill is required to populate Owners as grant rows.

**5. Migration is API-only.**
No SQL migration. Existing rows remain valid (every existing grant row was for a **Member**, and that meaning is preserved). The only behavioural change at deploy time is that **Admins** who were implicitly appearing in member lists/pickers stop appearing in spaces they have not joined. **Admins** who own spaces (which includes `default-administrator` for the `default` space and any other space it created during the [ADR-0007](../adr/0007-open-space-creation-and-space-owner.md) backfill) keep appearing via the Owner shortcut.

**6. Self-join affordance.**
A non-affiliated actor — including a non-owning **Admin** — landing on a space's page sees a "Join this Space" button in the header. Click → `POST /api/spaces/:id/access` with their own `user_id`. The same endpoint, already authorized for Owner-or-Admin callers (an Admin trivially satisfies the latter), now also handles the "Admin self-grants" case once the type guard is dropped.

## Step-by-step plan

1. **Extend the `Actor` interface with `affiliatedSpaceIds`.** Edit [backend/src/auth/actor.ts](../../backend/src/auth/actor.ts): add `affiliatedSpaceIds: Set<string>` to the `Actor` interface (line 8). Update `loadActor` (line 62) so the owned+granted `Set` is computed *unconditionally* (not just when role is Member), then return it as `affiliatedSpaceIds` in both the Admin and Member branches. For Admins, `accessibleSpaceIds` remains `"all"`; for Members it remains the same `Set` (point both fields at the same `Set` instance — they are equal for Members and there is no need to clone).

2. **Drop the `400 if user is Admin` guard in `POST /api/spaces/:id/access`.** Edit [backend/src/routes/spaces.ts:302](../../backend/src/routes/spaces.ts). Remove the line `if (targetUser.role === "Admin") return reply.code(400).send({ error: "Admin already has access to all spaces" });`. Keep the "already has access" check for existing grant rows.

3. **Switch SSE filtering to `affiliatedSpaceIds`.** Edit [backend/src/routes/stream.ts:21](../../backend/src/routes/stream.ts). Change `const accessibleSpaceIds = req.actor?.accessibleSpaceIds ?? "all";` to `const affiliatedSpaceIds: Set<string> = req.actor?.affiliatedSpaceIds ?? new Set();`. Update `shouldForwardEvent` (line 4) to take a `Set<string>` (no `"all"` case) and use that. The unauthenticated fallback (`"all"`) becomes "empty set" — an unauthenticated subscriber receives nothing, which is correct.

4. **Replace `accessibleSpaceIds === "all"` Admin-role-proxy uses with `actor.role === "Admin"`.** Edit:
   - [backend/src/auth/policy.ts](../../backend/src/auth/policy.ts) `canManageUsers` (line 18), `canEditUser` (line 22), `canDeleteUser` (line 27).
   - [backend/src/routes/tokens.ts](../../backend/src/routes/tokens.ts) lines 51, 110, 141.
   Leave the sentinel comparisons inside `canAccessSpace` and `canManageSpace` (lines 4, 9) untouched — those are about permission scope, not role.

5. **Add `affiliated: boolean` to the `Space` shape.** Edit [shared/src/index.ts](../../shared/src/index.ts): add `affiliated: boolean` to the exported `Space` interface. From the root, run `npm run build` to confirm the shared workspace still compiles.

6. **Populate `affiliated` in `GET /api/spaces` and `GET /api/spaces/:id`.** Edit [backend/src/routes/spaces.ts](../../backend/src/routes/spaces.ts): wherever a `Space` is returned, compute `affiliated = actor.affiliatedSpaceIds.has(space.id) || space.created_by === actor.id` and include it in the response. Add this in the same mapping helper that today emits the `Space` shape (so detail and list endpoints stay consistent).

7. **Rewrite the candidates filter in `SpaceAccessList`.** Edit [frontend/src/components/SpaceAccessList.tsx](../../frontend/src/components/SpaceAccessList.tsx). In the `candidates` filter (around line 66), remove the `u.role !== "Admin"` clause (line 69) so Admins are eligible candidates. Remove the explanatory line "Admins already have access to all spaces and are excluded." (line 131).

8. **Update the verbiage on the Space access section.** In the same file: change the heading "People with access" (line 78) to "People in this Space". Change the placeholder "Grant access to a Member…" (line 127) to "Bring someone into this Space…". Update the empty-state copy "No one else has been granted access." (line 84) to "No one else is in this Space yet."

9. **Add a "Join this Space" affordance on the space header.** Edit [frontend/src/components/SpaceDetailHeader.tsx](../../frontend/src/components/SpaceDetailHeader.tsx). The header already receives `space` and `owner`; pipe the current user's `affiliated` flag through from `SpaceDetailPage`. When the actor is not affiliated and not the Owner, render a button next to (or near) the existing Archive/Delete cluster: `Join this Space`. Click → call `api.grantSpaceAccess(space.id, { user_id: currentUser.id })` and invalidate `["space", space.id]` + `["spaces"]`.

10. **Surface affiliation on the Spaces list.** Edit [frontend/src/components/SpaceCard.tsx](../../frontend/src/components/SpaceCard.tsx). When `space.affiliated === false`, render a small "Not in this space" pill in the card's chrome (mirror the existing "archived" pill style). When affiliated, no badge (it is the expected state). The intent is to make the asymmetry visible to **Admins** on the spaces list at a glance.

11. **Update the demo seed.** Edit [backend/demo/seed.sql:362](../../backend/demo/seed.sql). Add a row granting `alice` (Admin) access to the `sandbox` space:
    ```sql
    INSERT INTO user_space_access (user_id, space_id, granted_at, granted_by) VALUES
      ('alice', 'sandbox', '2025-02-15T09:05:00Z', 'john'),
      -- (existing rows below)
    ```
    `alice` already appears in `default` via the Owner shortcut (she created it per the existing seed), so this single new row demonstrates an Admin appearing in a space they don't own via an explicit grant. Do *not* add a grant for `default-administrator` in any space — it is intentionally not in `default` via a grant (it owns no spaces in this seed; it appears via no surface unless joined, which exercises the new model).

12. **Add backend tests.** Create `backend/tests/space_affiliation.test.ts`. Cover:
    - `loadActor` returns `accessibleSpaceIds === "all"` for Admins and a `Set` equal to owned+granted; returns the same `Set` for both fields for Members.
    - `POST /api/spaces/:id/access` accepts an Admin target and creates a row.
    - `GET /api/spaces/:id/access` returns the new row for the Admin.
    - `GET /api/spaces` includes `affiliated: true` for spaces the actor owns or has been granted, `false` for spaces the actor only sees because they are an Admin.
    - `GET /api/events/stream` does not push events for a space the Admin actor is not affiliated with (use a fixture: Admin connects, a task is created in a space they have not joined, no event arrives within the test window). Then grant access and confirm subsequent events arrive.
    - `canManageSpace` still returns `true` for an Admin who has not joined the space (administrative powers preserved).

13. **Smoke-check existing tests.** Run `npm test` from the root. Anywhere a test asserts that an Admin appears in a `/api/spaces/:id/access` response or in an assignee picker without an explicit grant, update the fixture to grant the Admin first. (There should be few or none — these surfaces previously rejected Admins as grant targets.)

14. **Manual frontend walkthrough.** With the demo seed, log in as `alice` (Admin). Confirm `default` shows `alice` in "People in this Space" (via Owner shortcut, no grant row required). Confirm `sandbox` shows `alice` (via the new grant row from step 11). Create a new third space as `john`; load it as `alice` — confirm no badge says she is in it, the "Join this Space" button appears in the header, and her name does *not* appear in the assignee picker for that space. Click "Join this Space", confirm she now appears.

## Demo seed data

This plan adjusts an existing table (`user_space_access`) rather than introducing a new entity. The single seed change is step 11 above — add `alice → sandbox`. No new tables, columns, or relationships are introduced.

## Testing strategy

- **Unit / integration tests** (vitest, `backend/tests/`): the new `space_affiliation.test.ts` from step 12 above is the primary new coverage.
- **Regression suite**: full `npm test` must pass. The auth and spaces routes are the most likely sources of incidental breakage; pay particular attention to any test that previously asserted "Admin gets 400 when granted access".
- **Type checks**: `npm run typecheck` in both `backend/` and `frontend/`. The `Actor` interface change and the new `affiliated` field on `Space` will surface any callers that destructure these types.
- **Manual frontend checks** (no component tests in this codebase):
  - Log in as the Default Administrator on a fresh demo. Confirm `default` shows them in "People in this Space" (via Owner shortcut). Navigate to `sandbox` (which they do not own); confirm "Join this Space" appears and the pickers do not include them. Join. Confirm they now appear.
  - Log in as an Admin who owns no spaces (create one ad-hoc via seed tweak or `POST /api/spaces` as `alice`). Confirm the spaces-list shows "Not in this space" badges for spaces they have not joined.
  - Log in as a **Member** (`agent-backend`). Confirm UI is unchanged from current behaviour — they see only spaces they have access to, and the new verbiage reads naturally for them too.
- **SSE manual check**: with two browser windows (Admin not-joined to space S in one, Member of S in the other), make a change in S as the Member. Confirm the Admin window does *not* live-update; the Member window does. Refresh the Admin window — they should see the change appear (REST is unfiltered).

## Acceptance criteria

- [ ] `Actor.affiliatedSpaceIds: Set<string>` exists and is populated for every authenticated actor.
- [ ] `loadActor` computes the owned+granted set unconditionally.
- [ ] `POST /api/spaces/:id/access` accepts an Admin target and creates a grant row.
- [ ] `GET /api/spaces` and `GET /api/spaces/:id` include `affiliated: boolean` on every `Space` object.
- [ ] `GET /api/events/stream` filters by `affiliatedSpaceIds`; an Admin who has not joined a space receives no SSE events from it.
- [ ] `canAccessSpace` and `canManageSpace` continue to return `true` for Admins on any space (administrative powers preserved).
- [ ] Admin-role-proxy `=== "all"` uses replaced with `actor.role === "Admin"` in `policy.ts` and `routes/tokens.ts`; sentinel comparisons inside permission predicates left intact.
- [ ] Frontend Space page shows "People in this Space" / "Bring someone into this Space…"; "People with access" / "Grant access to a Member…" wording is gone.
- [ ] "Join this Space" button appears in `SpaceDetailHeader` for any actor who is not the Owner and not in `affiliatedSpaceIds`. Click joins them.
- [ ] `SpaceCard` renders a "Not in this space" affordance when `affiliated === false`.
- [ ] `backend/demo/seed.sql` includes the `alice → sandbox` grant row.
- [ ] New `backend/tests/space_affiliation.test.ts` covers the cases enumerated in step 12.
- [ ] `npm test` passes from the root.
- [ ] `npm run typecheck` passes in `backend/` and `frontend/`.
- [ ] CLAUDE.md is updated where it currently states "Admins see everything" (specifically the role/access blurb under "Roles and access control") to reflect that admins still have full powers but no longer auto-appear in space-level affiliation surfaces.

## Open questions

None — all design decisions resolved during grilling. The four design forks (terminology in CONTEXT.md, Actor-model split, migration policy, SSE filter basis) and the smaller wrap-up points (response shape, sentinel cleanup, self-leave scope, ADR) are all decided. ADR-0012 captures the rationale for the executor's future reference.

## Out-of-band work

- Issues [#91 (pages-first redesign)](https://github.com/johnmarcampbell/fjord/issues/91) and [#63 (MCP server)](https://github.com/johnmarcampbell/fjord/issues/63) are blocked on this plan landing — both depend on the final permission/affiliation semantics. Once this ships, unblock them in their issue bodies.
- A follow-up issue should be filed for **self-leave** (Member or Admin removing their own `user_space_access` row) — natural symmetry with "Join this Space" but deliberately punted from this plan to keep scope tight.
- A future plan for `@mentions` or notifications should consult ADR-0012 to ensure those features use `affiliatedSpaceIds`, not `accessibleSpaceIds`.
