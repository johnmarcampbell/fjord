# Shared package deepening

> Move pure identity validators, two task-lifecycle predicates, and a small domain-error-code union into the shared workspace so the same rules are enforced on both sides of the wire — and so the frontend can branch on machine-readable error codes instead of substring-matching server messages.

## Source

- Report: [docs/reports/shared-package-architecture-deepening-2026-05-21.md](../reports/shared-package-architecture-deepening-2026-05-21.md)
- No GitHub issue. Author-initiated refactor based on the report's findings.

The report enumerated six "deepening opportunities". Three were judged worth doing (#1 identity rules, #4 domain error catalog, #5 task lifecycle rules) and three were rejected during grilling (#2 authorization policy — the backend `Actor` and frontend `User` shapes differ legitimately and a shared adapter would add more code than it removes; #3 authentication transport contract — vague, with the valuable bits collapsing into #4; #6 event semantics — broad cache invalidation is the right design for this app size).

## Context

The shared package (`@agentic-kanban/shared`) is currently a flat types-and-constants module with one behaviour helper (`isTaskBlocked`). Several domain invariants are encoded twice — once in [backend/src/services/users.ts](../../backend/src/services/users.ts) and again, in subtly different form, in [frontend/src/components/UserFormDialog.tsx](../../frontend/src/components/UserFormDialog.tsx). The two copies of avatar validation disagree (the frontend rejects multi-emoji strings; the backend accepts them, so a direct API call can persist a value the UI was designed to disallow). The frontend also string-matches on server error messages — `UserFormDialog.tsx:186` does `err.message.toLowerCase().includes("handle")` to detect a handle-conflict 409 — which is fragile.

Domain terms used below — **Handle**, **Avatar**, **Role**, **Space**, **Task**, **Blocker** — are defined in [CONTEXT.md](../../CONTEXT.md).

## Goals

1. One canonical implementation of handle and avatar validation, sourced from `@agentic-kanban/shared`, exercised by both backend routes and the frontend `UserFormDialog`.
2. Shared validators return discriminated results (`{ ok: true; value } | { ok: false; code }`) — no exceptions cross the package boundary, and the failure `code` is reusable as the response code in goal 3.
3. Backend error responses gain an optional `code: DomainErrorCode` field (string union in shared) for the six error kinds a caller actually needs to discriminate today: `handle_invalid`, `handle_reserved`, `handle_taken`, `avatar_invalid`, `set_password_required`, `version_conflict`. The frontend stops string-matching server messages.
4. Two new shared predicates — `canArchive(task)` and `isBlockerSatisfied(blocker)` — replace the inline `column === "Done"` checks in both the backend archive route and the frontend `TaskDetail`. The existing `isTaskBlocked` is refactored to delegate to `isBlockerSatisfied`.
5. `DEFAULT_ADMINISTRATOR_ID` (today duplicated in [backend/src/services/users.ts:7](../../backend/src/services/users.ts) and [frontend/src/lib/policy.ts:3](../../frontend/src/lib/policy.ts)) moves to shared.
6. Avatar validation tightens to "exactly one grapheme or an http(s) URL" — narrower than the current backend rule (1–8 chars + any non-ASCII), matching the frontend's existing intent and CONTEXT.md's "a single emoji" definition.

## Non-goals

1. No shared authorization decision module (rejected opportunity #2). Backend `Actor`-based policy and frontend `User`/`Space`-based policy stay where they are.
2. No shared authentication transport contract module (rejected opportunity #3). CSRF header constants stay inline on each side. `requires_password_set` continues to live on `AuthMe`.
3. No shared event semantics module (rejected opportunity #6). Frontend stream handler keeps its current broad invalidation pattern.
4. No new error codes beyond the six listed above. Endpoints that don't currently need machine-readable discrimination keep `{ error: "message" }`. New codes can be added later when an actual caller demands one.
5. No migration of stored DB values. The narrower avatar rule is enforced on the input path (POST/PATCH); existing rows remain readable. No data backfill needed because the curated emoji list, the avatar backfill function, and `backend/demo/seed.sql` only ever produce single-grapheme avatars.
6. No changes to the OpenAPI / Scalar schema definitions for error responses. Fastify route schemas don't currently declare error response shapes; that gap stays open.
7. No new test framework for the `shared/` package itself. Tests for shared logic live in `backend/tests/` and import from `@agentic-kanban/shared`.
8. No deletion of error message strings. The `error` field continues to hold a human-readable message; `code` is an additive sibling.

## Relevant prior decisions

- [ADR-0002 — User profile backfill in app code](../adr/0002-user-profile-backfill-in-app-code.md) — the `backfillUserProfiles` function stays in the backend (it touches the DB); only the pure pieces it calls (`slugify`, `pickAvatar`) move to shared.
- [ADR-0006 — Default administrator user](../adr/0006-default-administrator-user.md) — `DEFAULT_ADMINISTRATOR_ID` is a domain concept referenced by this ADR, justifying its move to shared.
- [ADR-0008 — Password authentication](../adr/0008-password-authentication.md) — `set_password_required` is the one already-coded error response we're standardising; today it's misplaced in the `error` field instead of a `code` field ([backend/src/server.ts:133](../../backend/src/server.ts)) and this plan fixes that.

No new ADRs. None of the decisions here is hard to reverse: the discriminated-result style for validators can be swapped back; the optional `code` field can be removed; predicates can be inlined. They're refactors, not architectural commitments.

## Relevant files and code

Files that move logic *into* shared:
- [shared/src/index.ts](../../shared/src/index.ts) — destination for new validators, predicates, and the `DomainErrorCode` union.

Files that lose their copy and call shared instead:
- [backend/src/services/users.ts:16-96](../../backend/src/services/users.ts) — current home of `slugify`, `hashCode`, `pickAvatar`, `normalizeHandle`, `validateAvatar`, `HandleError`, `AvatarError`. Keeps `resolveHandleCollision`, `backfillUserProfiles`, `seedDefaultAdministrator` (DB-touching, backend-only).
- [backend/src/routes/users.ts:107,113,131,232,239,250](../../backend/src/routes/users.ts) — call sites for the validators; switch from `try/catch` to discriminated-result branching, and emit `code` in 400/409 responses.
- [backend/src/server.ts:23-24,133,256,269](../../backend/src/server.ts) — `slugify` and `pickAvatar` imports move to shared; `set_password_required` response moves from `{ error: "set_password_required" }` to `{ error: "...", code: "set_password_required" }`.
- [frontend/src/components/UserFormDialog.tsx:34-83](../../frontend/src/components/UserFormDialog.tsx) — delete the local `validateHandle`, `validateAvatar`, `slugifyForHandle`, `countGraphemes`, `RESERVED_SET`. Switch error handling at [:185-192](../../frontend/src/components/UserFormDialog.tsx) from `err.message.toLowerCase().includes("handle")` to `err.body?.code === "handle_taken"`.
- [frontend/src/lib/policy.ts:3](../../frontend/src/lib/policy.ts) — delete the local `DEFAULT_ADMINISTRATOR_ID`; import from shared.

Files that adopt the new task-lifecycle predicates:
- [backend/src/services/tasks.ts](../../backend/src/services/tasks.ts) — archive route's inline `task.column !== "Done"` check switches to `!canArchive(task)`. Any blocker-state check that mirrors `isTaskBlocked`'s body switches to `isBlockerSatisfied`.
- [frontend/src/components/TaskDetail.tsx:169,323](../../frontend/src/components/TaskDetail.tsx) — replace `blocker?.column === "Done" || blocker?.archived` with `isBlockerSatisfied(blocker)`; replace `task.column === "Done"` (gating the archive button) with `canArchive(task)`.

Files where error responses gain a `code`:
- [backend/src/routes/users.ts:102,113,239](../../backend/src/routes/users.ts) — handle-conflict 409s (`handle_taken`), invalid/reserved handle 400s (`handle_invalid`, `handle_reserved`), invalid avatar 400s (`avatar_invalid`).
- [backend/src/routes/tasks.ts:82-108](../../backend/src/routes/tasks.ts) — `mapServiceError`'s `VersionConflictError` branch gains `code: "version_conflict"` (the `current_version` payload stays).

Other:
- [shared/package.json](../../shared/package.json) — no changes needed (already builds via `tsc`).
- [backend/tests/](../../backend/tests/) — new test file(s) for the shared logic.

## Approach

The work splits cleanly into two PRs.

**PR-1 — Identity rules + domain error codes (opportunities #1 and #4 together).**

The two pieces reinforce each other: shared validators returning `{ ok: false; code: HandleErrorCode | AvatarErrorCode }` produce exactly the codes that flow into the new `code` field on backend error responses. Combining them avoids a transitional design where validators return one shape and then routes re-derive a different shape.

Validator interface:

```ts
// in shared/src/index.ts
export const DOMAIN_ERROR_CODES = [
  "handle_invalid",
  "handle_reserved",
  "handle_taken",
  "avatar_invalid",
  "set_password_required",
  "version_conflict",
] as const;
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export type Validated<T, C extends DomainErrorCode> =
  | { ok: true; value: T }
  | { ok: false; code: C; message: string };

export function validateHandle(input: string): Validated<string, "handle_invalid" | "handle_reserved">;
export function validateAvatar(input: string): Validated<string, "avatar_invalid">;
export function slugify(input: string): string;
export function pickAvatar(userId: string): string;
```

`message` on the failure branch is included for two reasons: (1) the frontend form needs a string to render under the field, (2) the backend can pass it straight through to the `error` field of the response. Keeping `message` in the validator (rather than constructing it at the call site) keeps copy consistent across both sides.

Response envelope: `{ error: string, code?: DomainErrorCode, ...extras }` — `error` continues to be the human-readable message, `code` is an additive optional field, existing payload extras like `current_version` continue as siblings. Smallest-diff change to existing responses.

The avatar rule narrows: input must be either an http(s) URL (≤2048 chars) or exactly one grapheme (verified via `Intl.Segmenter`, which is available in Node 22 — the backend runtime). This closes the gap where an agent calling the API directly could persist a multi-emoji avatar.

The `HandleError` / `AvatarError` exception classes get deleted. Backend routes switch from `try { normalizeHandle(...) } catch (e: HandleError) { ... }` to `const r = validateHandle(...); if (!r.ok) return reply.code(400).send({ error: r.message, code: r.code })`. Net code shrinks at the call sites.

`set_password_required` migration: today [backend/src/server.ts:133](../../backend/src/server.ts) sends `reply.code(403).send({ error: "set_password_required" })` — wrong field. It becomes `reply.code(403).send({ error: "Set a password before making changes", code: "set_password_required" })`. The frontend (if any consumer branches on this today) updates to read `body.code` instead of `body.error`. This is technically a breaking change, but the only known consumer is the forced-set-password redirect in [frontend/src/components/AuthGate.tsx](../../frontend/src/components/AuthGate.tsx) — verify and update in the same PR.

`DEFAULT_ADMINISTRATOR_ID` moves to shared in this PR (it's a domain constant, naturally grouped with handle/avatar identity rules). About six backend import sites update; one frontend import site updates.

**PR-2 — Task lifecycle predicates (opportunity #5).**

Independent of PR-1. Adds two pure predicates to shared:

```ts
export function canArchive(task: Pick<Task, "column" | "archived">): boolean {
  return task.column === "Done" && !task.archived;
}
export function isBlockerSatisfied(blocker: Pick<Task, "column" | "archived">): boolean {
  return blocker.column === "Done" || blocker.archived;
}
```

`isTaskBlocked` refactors to call `isBlockerSatisfied` internally — three lines, no behaviour change, but it prevents the two predicates from drifting apart. Backend archive route switches to `canArchive`; frontend `TaskDetail` switches both inline checks. After the refactor, the strings `"Done"` and `.archived` should appear in shared only — grep can verify.

## Step-by-step plan

### PR-1: Identity rules + domain error codes

1. **Create the feature branch.** `git pull origin main && git checkout -b refactor/shared-identity-and-error-codes`. Per the workflow note, the branch must exist before any file is touched.

2. **Add the `DomainErrorCode` union to shared.** Edit [shared/src/index.ts](../../shared/src/index.ts) to add `DOMAIN_ERROR_CODES` (as const array) and `DomainErrorCode` (string union) with the six values: `handle_invalid`, `handle_reserved`, `handle_taken`, `avatar_invalid`, `set_password_required`, `version_conflict`. Run `npm run build` from root to confirm shared still compiles.

3. **Add the `Validated<T, C>` helper type to shared.** Same file. Defined as the discriminated union shown in Approach above.

4. **Move `DEFAULT_ADMINISTRATOR_ID` to shared.** Add `export const DEFAULT_ADMINISTRATOR_ID = "default-administrator"` to [shared/src/index.ts](../../shared/src/index.ts). Delete the constant from [backend/src/services/users.ts:7](../../backend/src/services/users.ts) and [frontend/src/lib/policy.ts:3](../../frontend/src/lib/policy.ts) and update their import statements. Run `npm run build` from root.

5. **Move `slugify`, `hashCode`, `pickAvatar` to shared.** Copy the implementations from [backend/src/services/users.ts:16-37](../../backend/src/services/users.ts) into [shared/src/index.ts](../../shared/src/index.ts) (unchanged behaviour). Delete the originals. Update backend import sites — [backend/src/server.ts:23-24](../../backend/src/server.ts), [backend/src/services/users.ts](../../backend/src/services/users.ts) (still uses `slugify` internally in `backfillUserProfiles`), [backend/src/routes/users.ts:9-12](../../backend/src/routes/users.ts) — to import from `@agentic-kanban/shared`. Run `npm test` to confirm no regression.

6. **Add `validateHandle` and `validateAvatar` to shared.** Edit [shared/src/index.ts](../../shared/src/index.ts) to implement both with the `Validated<...>` return shape. `validateHandle`: lowercase, check `HANDLE_REGEX`, check `RESERVED_HANDLES`. `validateAvatar`: http(s) URL check (with ≤2048 length), else require non-ASCII + exactly one grapheme via `Intl.Segmenter`. Both include a `message` field on the failure branch with the same copy used today.

7. **Switch backend routes to the new validators.** Edit [backend/src/routes/users.ts](../../backend/src/routes/users.ts) — the four call sites at lines 107, 131, 232, 250. Replace `try { normalizeHandle(...) } catch ...` and `try { validateAvatar(...) } catch ...` blocks with `const r = validateHandle(...); if (!r.ok) return reply.code(400).send({ error: r.message, code: r.code })`. For the handle-collision check at lines 113 and 239, send `code: "handle_taken"` alongside the existing message.

8. **Delete `HandleError`, `AvatarError`, `normalizeHandle`, the standalone `validateAvatar` from backend.** With all backend call sites switched, [backend/src/services/users.ts](../../backend/src/services/users.ts) only needs to retain `resolveHandleCollision`, `backfillUserProfiles`, `seedDefaultAdministrator`. The first now imports `validateHandle`'s component pieces from shared if needed (it currently only uses `RESERVED_SET` — keep that local helper or rewrite to use the shared `RESERVED_HANDLES` directly).

9. **Migrate `set_password_required` to the `code` field.** Edit [backend/src/server.ts:133](../../backend/src/server.ts) to send `{ error: "Set a password before making changes", code: "set_password_required" }` instead of `{ error: "set_password_required" }`. Grep for any other emitters: `grep -rn "set_password_required" backend/src/` — update each.

10. **Add `code: "version_conflict"` to the version-conflict response.** Edit `mapServiceError` in [backend/src/routes/tasks.ts:86](../../backend/src/routes/tasks.ts) so the `VersionConflictError` branch sends `reply.code(409).send({ error: "Version conflict", code: "version_conflict", current_version: err.currentVersion })`.

11. **Switch the frontend `UserFormDialog` to the new validators.** Edit [frontend/src/components/UserFormDialog.tsx](../../frontend/src/components/UserFormDialog.tsx) — delete the local `validateHandle`, `validateAvatar`, `slugifyForHandle`, `countGraphemes`, `RESERVED_SET`. Import `validateHandle`, `validateAvatar`, `slugify` from `@agentic-kanban/shared`. Update the in-component field-error state: the `result.message` from a failing validator goes into `fieldErrors.handle` / `fieldErrors.avatar`.

12. **Switch the frontend error-branching from string-match to code.** Same file, around [line 186](../../frontend/src/components/UserFormDialog.tsx). Replace `err.status === 409 && err.message.toLowerCase().includes("handle")` with `err.body && (err.body as { code?: string }).code === "handle_taken"`. (`ApiError` already carries `body` per [frontend/src/lib/api.ts:31-39](../../frontend/src/lib/api.ts).)

13. **Audit any other frontend consumers of `set_password_required`.** Grep `grep -rn "set_password_required" frontend/src/` — update each call site to read `body.code` rather than `body.error`. Confirm [frontend/src/components/AuthGate.tsx](../../frontend/src/components/AuthGate.tsx) is correct.

14. **Add unit tests for the new shared logic.** Create `backend/tests/shared-identity.test.ts`. Import `validateHandle`, `validateAvatar`, `slugify`, `pickAvatar`, `DEFAULT_ADMINISTRATOR_ID` from `@agentic-kanban/shared`. Cover: handle invalid-format → `code: "handle_invalid"`; handle reserved → `code: "handle_reserved"`; handle valid → `ok: true`; case folding; max-length boundary; avatar single emoji ok; avatar multi-emoji rejected with `code: "avatar_invalid"`; avatar http(s) URL ok; avatar oversize URL rejected; avatar ASCII-only rejected; `slugify` deterministic samples; `pickAvatar` deterministic samples.

15. **Run pre-PR checks.** From root: `npm test`, `npm run typecheck` (in both `backend/` and `frontend/`), `npm run build`, `docker build -t agentic-kanban .`. Fix anything that fails.

16. **Open PR-1.** Title: "Move identity rules to shared, add domain error codes". Body links back to this plan and to the source report. No issue reference (no GitHub issue exists).

### PR-2: Task lifecycle predicates

Should land after PR-1 to keep history clean, but doesn't strictly depend on it.

17. **Create the feature branch.** `git pull origin main && git checkout -b refactor/shared-task-lifecycle-predicates`.

18. **Add `canArchive` and `isBlockerSatisfied` to shared.** Edit [shared/src/index.ts](../../shared/src/index.ts), placed beside the existing `isTaskBlocked`. Signatures and bodies are exactly as in the Approach section.

19. **Refactor `isTaskBlocked` to delegate.** Same file. Change its inner check from `blocker.column !== "Done" && !blocker.archived` to `!isBlockerSatisfied(blocker)`.

20. **Switch backend archive route to `canArchive`.** Find the archive-eligibility check in [backend/src/services/tasks.ts](../../backend/src/services/tasks.ts) (look for `column !== "Done"` near the archive function — it raises a `TaskStateError`). Replace with `if (!canArchive(task)) throw new TaskStateError(...)`. Also grep `backend/src/` for any other lingering `column !== "Done"` / `column === "Done"` literals that should adopt the predicate.

21. **Switch frontend `TaskDetail` to the predicates.** Edit [frontend/src/components/TaskDetail.tsx](../../frontend/src/components/TaskDetail.tsx). Line 169: replace `blocker?.column === "Done" || blocker?.archived` with `blocker ? isBlockerSatisfied(blocker) : false`. Line 323: replace the surrounding `task.column === "Done"` check (gating the archive button) with `canArchive(task)`.

22. **Add unit tests.** Append to `backend/tests/shared-identity.test.ts` (or new file): `canArchive` truth table over column × archived combinations; `isBlockerSatisfied` truth table; regression test that the existing `isTaskBlocked` still returns the same answer after the delegation refactor.

23. **Run pre-PR checks.** Same as step 15.

24. **Open PR-2.** Title: "Move task lifecycle predicates to shared".

## Demo seed data

No changes to [backend/demo/seed.sql](../../backend/demo/seed.sql). This plan is a refactor: no new tables, columns, entity types, relationships, or API capabilities are added. The narrower avatar rule is enforced on inputs only, and the existing seed avatars are all single-grapheme.

## Testing strategy

**Unit tests (added in this plan)**: `backend/tests/shared-identity.test.ts` covers every public function moved into shared. Coverage matrix is itemised in step 14 and step 22. The file imports from `@agentic-kanban/shared` rather than from backend paths to confirm the package boundary actually exposes what's needed.

**Integration tests (regression)**: existing [backend/tests/](../../backend/tests/) suite covers the routes touched in this plan (`/api/users`, `/api/tasks`, archive, blocker, login). All must continue passing. The error-response envelope change is additive (`code` is a new optional field), so existing tests that assert on `body.error` keep working.

**Manual frontend checks** (no component tests per CLAUDE.md):

- Create a new user via the `+ New user` tile. Verify the handle field rejects invalid/reserved handles with the right inline error copy. Verify the avatar field rejects a two-emoji string (e.g., `🦊🦁`) — this is the *new* behaviour and the regression to watch.
- Trigger a handle conflict (create user, then create another with the same handle). The form must surface "handle is taken" under the handle field, not as a top-level server error — this confirms the code-based branching works.
- Log in as a user whose `password_hash` is null (e.g., a freshly seeded `default-administrator` in demo mode). Make a write request; verify the 403 still triggers the forced-set-password redirect after the `set_password_required` field migration.
- Drag a task to `Done`, open it, archive it. Verify the archive button only appears in `Done` (per `canArchive`). Drag back to `To Do`, confirm button disappears.
- Add a blocker to a task; move the blocker to `Done`; verify the blocked state clears (per `isBlockerSatisfied`).

**Regression risk**: the `set_password_required` field migration (step 9) is the highest-risk single change because it's a wire-format change on a 403 response. Audit (step 13) plus the manual check above must both pass.

## Acceptance criteria

- [ ] `validateHandle`, `validateAvatar`, `slugify`, `pickAvatar`, `hashCode`, `DEFAULT_ADMINISTRATOR_ID`, `DOMAIN_ERROR_CODES`, `DomainErrorCode`, `Validated`, `canArchive`, `isBlockerSatisfied` are all exported from `@agentic-kanban/shared`.
- [ ] `HandleError` and `AvatarError` classes no longer exist anywhere in the repo (`grep -rn "HandleError\|AvatarError" .` returns empty).
- [ ] Frontend `UserFormDialog.tsx` no longer defines `validateHandle`, `validateAvatar`, `slugifyForHandle`, `countGraphemes`, `RESERVED_SET`.
- [ ] `grep -rn '\.message\.toLowerCase().includes\|\.message\.includes(' frontend/src/` returns no matches related to error branching.
- [ ] Backend `/api/users` POST and PATCH responses for invalid/reserved/conflicting handles and invalid avatars include a `code` field with one of: `handle_invalid`, `handle_reserved`, `handle_taken`, `avatar_invalid`.
- [ ] Backend `/api/tasks/:id` PATCH version-conflict 409 response includes `code: "version_conflict"` and the existing `current_version` field.
- [ ] Backend 403 `set_password_required` response uses `code: "set_password_required"`, not `error: "set_password_required"`.
- [ ] Avatar input `🦊🦁` is rejected by both the frontend form and a direct curl POST to `/api/users`.
- [ ] `grep -n "column === \"Done\"\|column !== \"Done\"" backend/src/ frontend/src/components/` returns matches only inside shared or test files.
- [ ] `npm test` from root passes (existing + new tests).
- [ ] `npm run typecheck` clean in both `backend/` and `frontend/`.
- [ ] `npm run build` from root succeeds.
- [ ] `docker build -t agentic-kanban .` succeeds.
- [ ] Manual frontend checks listed under Testing strategy all pass.

## Open questions

None — all design decisions resolved during grilling.

## Out-of-band work

None. The three rejected opportunities from the source report (#2 authorization policy, #3 transport contract, #6 event semantics) are not deferred follow-ups — they're deliberately not happening, for reasons documented in the Source section.
