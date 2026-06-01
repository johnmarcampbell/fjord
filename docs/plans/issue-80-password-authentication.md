# Password authentication

> Replace the trusted-gateway `X-User-Id` identity model with real authentication: humans log in with a password to establish a session cookie; agents and CLI callers authenticate with bearer API tokens.

## Source

- GitHub issue: **#80 — Add password authentication** — https://github.com/johnmarcampbell/fjord/issues/80
- Deferred follow-up surfaced during grilling: **#84 — Switch from better-sqlite3 to node:sqlite** — https://github.com/johnmarcampbell/fjord/issues/84 (independent; this plan does **not** depend on it but consciously avoids adding new native dependencies so #84 stays small).

## Context

fjord today identifies callers by an `X-User-Id` header chosen from a `UserPicker` and stored in `localStorage`. The app is designed to run inside a trusted gateway alongside Openclaw, with optional coarse gating via a single shared `FJORD_AUTH_TOKEN` bearer. There is no per-user authentication.

Issue #80 introduces real authentication so the app can be exposed outside that trusted-gateway context. Grilling resolved the open questions in the issue:

- Password auth **replaces** the header model rather than layering on top of it.
- Demo mode remains a first-class, intentionally unauthenticated feature — every demo visitor logs in automatically as the `default-administrator`.
- Humans use **scrypt**-hashed passwords + HttpOnly session cookies; agents use long-lived **API tokens** sent as `Authorization: Bearer fjord_...`. Humans may issue API tokens for CLI use.
- The full design is captured across three new ADRs (see "Relevant prior decisions" below).

Domain terms are defined in [CONTEXT.md](../../CONTEXT.md): **User**, **Kind**, **Handle**, **Role**, **Password**, **Session**, **API token**, **Token preview**, **Login**.

## Goals

1. Humans authenticate by posting `{ user_id, password }` to `POST /api/auth/login`. The server verifies a scrypt hash and issues an HttpOnly session cookie.
2. Agents (and humans for CLI) authenticate by sending `Authorization: Bearer fjord_...` with a valid, non-revoked, non-expired API token.
3. The `X-User-Id` header, the `UserPicker` UI, the `FJORD_AUTH_TOKEN` shared bearer, and the demo-mode auto-create-on-unknown-header behavior are all **removed**.
4. `users.password_hash` (nullable) replaces `users.token_hash` (dropped). A user with `password_hash IS NULL` and `kind = 'human'` can log in once without a password, after which write endpoints reject them until they set one.
5. New `sessions` table backs server-side sessions. Idle expiry only, configurable via `FJORD_SESSION_IDLE_DAYS` (default 30).
6. New `api_tokens` table with the dual `lookup_hash` (SHA-256, O(1) lookup) + `token_hash` (scrypt, authoritative verify) pattern from [ADR-0010](../adr/0010-api-token-format-and-storage.md). Tokens are listable, revocable (soft-delete via `revoked_at`), and optionally expire.
7. Demo mode: `POST /api/auth/login` with no body issues a session for `default-administrator`; no login UI is shown; bootstrap warnings and force-change rules are silenced.
8. Bootstrap: `FJORD_BOOTSTRAP_PASSWORD` env var seeds the default-administrator's password on a fresh install (only honored when `password_hash IS NULL`).
9. `npm run reset-admin-password` CLI clears the default-administrator's password hash for operator recovery.
10. Admin can reset any user's password via the existing user-card UI (sets their hash to NULL).
11. Users can change their own password via a settings flow.
12. CSRF on the cookie path is mitigated by `SameSite=Lax` plus a required `X-Requested-With: fjord` header on all write requests.

## Non-goals

1. **Public signup / open registration.** Admins still provision users.
2. **Email-based password reset.** No SMTP. Reset is admin-mediated (set hash to NULL).
3. **2FA / TOTP / WebAuthn.** Out of scope.
4. **Federated identity (OIDC, SAML, OAuth).** Out of scope.
5. **Per-token scopes / fine-grained permissions.** API tokens inherit the issuing user's role.
6. **Absolute session timeout.** Idle-only.
7. **Session listing / "manage your sessions" UI.** Cheap to add later once the table exists; defer.
8. **Migration of `better-sqlite3` to `node:sqlite`.** Tracked separately in #84.
9. **Migrating *existing* user passwords from somewhere.** There is no prior password state; the migration is greenfield (all `password_hash` start as NULL).
10. **Audit-log table for token issuance / revocation.** `created_at`/`revoked_at`/`last_used_at` on `api_tokens` is the only record.

## Relevant prior decisions

- **ADR-0004** — Soft delete users ([docs/adr/0004-soft-delete-users.md](../adr/0004-soft-delete-users.md)). Soft-deleted users continue to be rejected at the auth layer.
- **ADR-0005** — Role column on users ([docs/adr/0005-role-column-on-users.md](../adr/0005-role-column-on-users.md)). Roles are unchanged; password auth is additive.
- **ADR-0006** — Default Administrator user ([docs/adr/0006-default-administrator-user.md](../adr/0006-default-administrator-user.md)). Default admin's password lifecycle is now load-bearing for bootstrap.
- **ADR-0007** — Open space creation and Space Owner ([docs/adr/0007-open-space-creation-and-space-owner.md](../adr/0007-open-space-creation-and-space-owner.md)). Unchanged.
- **ADR-0008** — Password authentication replaces trusted-gateway identity model ([docs/adr/0008-password-authentication.md](../adr/0008-password-authentication.md)). **New, created with this plan.**
- **ADR-0009** — Password hash algorithm and format ([docs/adr/0009-password-hash-format.md](../adr/0009-password-hash-format.md)). **New, created with this plan.**
- **ADR-0010** — API token format and storage ([docs/adr/0010-api-token-format-and-storage.md](../adr/0010-api-token-format-and-storage.md)). **New, created with this plan.**

## Relevant files and code

### Backend — existing files to modify or replace

- [backend/src/db/schema.ts](../../backend/src/db/schema.ts) — add `password_hash` column, drop `token_hash`, add `sessions` and `api_tokens` tables.
- [backend/src/auth/actor.ts](../../backend/src/auth/actor.ts) — currently resolves an `X-User-Id` header; will be rewritten to resolve sessions + bearer tokens.
- [backend/src/server.ts](../../backend/src/server.ts) lines 56-100 — remove `FJORD_AUTH_TOKEN` middleware, remove `/api/auth/validate`, wire in new auth routes and updated actor resolver.
- [backend/src/config.ts](../../backend/src/config.ts) — remove `FJORD_AUTH_TOKEN`, add `FJORD_BOOTSTRAP_PASSWORD`, add `FJORD_SESSION_IDLE_DAYS`.
- [backend/src/routes/users.ts](../../backend/src/routes/users.ts) — drop `token_hash` from request/response schemas. Add admin-only "reset password" capability via `PATCH /api/users/:id` (allow setting `password_hash` to null only).
- [backend/src/routes/stream.ts](../../backend/src/routes/stream.ts) — SSE endpoint must accept the session cookie (already authenticated by middleware) instead of `X-User-Id`.
- [backend/src/services/users.ts](../../backend/src/services/users.ts) — drop `tokenHash` from seed paths.
- [backend/demo/seed.sql](../../backend/demo/seed.sql) — verify no `token_hash` references remain; optionally seed a couple of `api_tokens` rows with known previews to demo the feature.

### Backend — new files

- `backend/src/services/passwords.ts` — scrypt wrapper: `hashPassword(plaintext) → string`, `verifyPassword(plaintext, stored) → boolean`. Uses the self-describing format from [ADR-0009](../adr/0009-password-hash-format.md).
- `backend/src/services/sessions.ts` — `createSession(userId)`, `resolveSession(sessionId) → Actor | null`, `deleteSession(id)`, `deleteAllSessionsForUser(userId)`, `bumpLastSeen(sessionId)`.
- `backend/src/services/api_tokens.ts` — `generateToken()` (returns `{ plaintext, lookupHash, scryptHash, preview }`), `issueToken(userId, name, expiresAt?)`, `verifyBearer(headerValue) → Actor | null`, `revokeToken(id)`.
- `backend/src/routes/auth.ts` — `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/logout-all`, `POST /api/auth/change-password`, `GET /api/auth/me`.
- `backend/src/routes/tokens.ts` — `POST /api/users/:id/tokens`, `GET /api/users/:id/tokens`, `DELETE /api/users/:id/tokens/:token_id`.
- `backend/src/scripts/reset-admin-password.ts` — CLI script described in step 13.
- `backend/migrations/0008_password_auth.sql` — drizzle-generated migration (filename will be drizzle's hash; manually rename if needed for clarity).

### Frontend — existing files to modify or replace

- [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts) — drop `X-User-Id` header. Add `credentials: 'include'`. Add `X-Requested-With: fjord` header on all writes. Treat 401 as "redirect to /login".
- [frontend/src/lib/auth.ts](../../frontend/src/lib/auth.ts) — currently handles the shared-token validation. Rewrite to manage session lifecycle (call `/api/auth/me`, redirect to `/login` on 401, expose `useCurrentUser()`).
- [frontend/src/lib/user.ts](../../frontend/src/lib/user.ts) — drop the localStorage `X-User-Id` logic; the current user is whatever `/api/auth/me` returns.
- [frontend/src/components/UserPicker.tsx](../../frontend/src/components/UserPicker.tsx) — **delete**.
- [frontend/src/components/AuthGate.tsx](../../frontend/src/components/AuthGate.tsx) — currently gates on shared-token validation. Rewrite to render `<LoginPage>` when unauthenticated and `<SetPasswordPage>` when the current user has `password_hash: null` (in prod mode).
- [frontend/src/components/Header.tsx](../../frontend/src/components/Header.tsx) — replace the `UserPicker` mount with a user-menu (current display name + avatar, dropdown with "Change password", "API tokens", "Log out").
- [frontend/src/components/UserCard.tsx](../../frontend/src/components/UserCard.tsx) — for admins, add a "Reset password" button on every user except the current actor. For the card's owner viewing their own card, add a "Change password" entry and surface their API tokens.
- [frontend/src/lib/stream.ts](../../frontend/src/lib/stream.ts) — `EventSource` will now carry the session cookie automatically (no header to set).

### Frontend — new files

- `frontend/src/pages/LoginPage.tsx` — handle + password form; submits `POST /api/auth/login`. In demo mode, instead auto-issues login on mount.
- `frontend/src/pages/SetPasswordPage.tsx` — forced password-set page when `password_hash IS NULL`. Single form (new + confirm). Submits `POST /api/auth/change-password` with no `current_password`.
- `frontend/src/components/ChangePasswordDialog.tsx` — voluntary change flow. Three fields: current, new, confirm.
- `frontend/src/components/TokenList.tsx` — renders an actor's API tokens (name, preview, created, last-used, expires, revoked). Owner or admin only.
- `frontend/src/components/TokenCreateDialog.tsx` — modal with name + expiry preset. Shows the plaintext token exactly once on success, with copy-to-clipboard.

### Cross-cutting

- [CLAUDE.md](../../CLAUDE.md) — rewrite the "Key constraints" bullet on no-authentication, the "Data flow" frontend section that references `X-User-Id`, the API overview's `X-User-Id` references, and the config table.
- [README.md](../../README.md) — add a "Recovery" section documenting `npm run reset-admin-password`.
- Root [package.json](../../package.json) and [backend/package.json](../../backend/package.json) — add `reset-admin-password` script.
- [shared/src/types.ts](../../shared/src/types.ts) (or wherever the shared `User` type lives) — drop `token_hash`; the type was never returned anyway, but the request-body interfaces accepting it must be cleaned up.

## Approach

The design centers on a single auth middleware that resolves the acting `Actor` from either a `Bearer` token or a session cookie. The middleware itself is unaware of "modes" — it just looks up credentials. Everything mode-specific (demo-mode auto-login, bootstrap password handling, the passwordless-once rule, the force-change-on-write rule) lives in the login endpoint and the policy layer.

This is deliberate: the auth surface area should be small and predictable. By the time a request reaches a route handler, `req.actor` is either set (authenticated) or the request was rejected at the middleware. Routes never see "demo vs prod" in the auth path.

### Authentication flow (humans, prod mode)

```
Browser                          Server
  |  POST /api/auth/login           |
  |  { user_id, password }          |
  |-------------------------------->|
  |                                 |  lookup user; verify scrypt
  |                                 |  INSERT INTO sessions
  |  200 { actor }                  |
  |  Set-Cookie: fjord_session=...     |
  |<--------------------------------|
  |  GET /api/tasks                 |
  |  Cookie: fjord_session=...         |
  |  X-Requested-With: fjord        |  (writes only)
  |-------------------------------->|
  |                                 |  resolveActor: cookie → session row → user
  |  200 [...]                      |  bump last_seen_at (debounced)
  |<--------------------------------|
```

### Authentication flow (agents)

```
Agent                            Server
  |  GET /api/tasks                 |
  |  Authorization: Bearer fjord_...   |
  |-------------------------------->|
  |                                 |  resolveActor:
  |                                 |    SHA-256(token) → api_tokens lookup
  |                                 |    scrypt-verify against token_hash
  |                                 |    check revoked_at, expires_at
  |  200 [...]                      |  bump last_used_at (debounced)
  |<--------------------------------|
```

### Demo mode

The auth middleware is unchanged. The login endpoint accepts an empty body when `config.demo === true` and issues a session for `default-administrator`. The frontend, on app boot, detects `demo: true` from `/api/config` and issues that login automatically — visitors never see the `LoginPage`.

### Passwordless-once and force-change

A user with `password_hash IS NULL` and `kind = 'human'` may log in successfully without supplying a password. The resulting session is real (cookie issued, `Actor` resolves normally), but a policy check on write endpoints rejects the actor with a 403 carrying a `set_password_required` discriminator. The frontend handles this by redirecting to `/set-password`. Once they submit `POST /api/auth/change-password` (without `current_password`, since their hash is null), the rule no longer applies.

This rule is silenced when `config.demo === true`.

### Migration story (operators)

For deployments that previously used `FJORD_AUTH_TOKEN`:

1. Set `FJORD_BOOTSTRAP_PASSWORD` on the new deploy.
2. After restart, log in as `admin` with that password. Existing non-admin users will have `password_hash IS NULL`.
3. For each user, either communicate their handle out of band so they can passwordless-log-in once, or click "Reset password" on their card (idempotent — their hash is already null) to prompt them.

For deployments that did **not** use `FJORD_AUTH_TOKEN` (running open behind a gateway): same as above. The `default-administrator` is created automatically (per ADR-0006) and its hash starts null, so omitting `FJORD_BOOTSTRAP_PASSWORD` will produce the startup warning and a passwordless admin.

## Step-by-step plan

### Phase 1 — Schema and shared types

1. **Extend the database schema.** In [backend/src/db/schema.ts](../../backend/src/db/schema.ts):
   - Add `passwordHash: text("password_hash")` (nullable) to the `users` table.
   - Remove `tokenHash: text("token_hash")` from the `users` table.
   - Add a new `sessions` table: `id` (text, pk), `userId` (text, fk → users.id, on delete cascade), `createdAt` (text), `lastSeenAt` (text), `expiresAt` (text). Add an index on `userId`.
   - Add a new `apiTokens` table per [ADR-0010](../adr/0010-api-token-format-and-storage.md): columns `id, userId, name, lookupHash (text, not null, unique), tokenHash, preview, createdAt, lastUsedAt, expiresAt, revokedAt`. Add an index on `userId`.
   - Run `cd backend && npm run db:generate` to produce a migration. Inspect the generated SQL to confirm the `users.token_hash` drop and the new tables look correct. Rename the file to `0008_password_auth.sql` if drizzle's auto-name is unhelpful.

2. **Clean shared types.** Find the request/response interfaces that reference `token_hash` (search `shared/` and `backend/src/routes/users.ts`) and remove them. The `User` interface itself never exposed `token_hash`; only `CreateUserRequest` / `UpdateUserRequest` accept it today. Verify `shared/` still builds: `npm run build -w shared`.

### Phase 2 — Password hashing service

3. **Implement `services/passwords.ts`.** Create `backend/src/services/passwords.ts` exporting:
   - `hashPassword(plaintext: string): Promise<string>` — generates 16 random salt bytes, calls `crypto.scrypt(plaintext, salt, 64, { N: 16384, r: 8, p: 1 })`, returns `scrypt$N=16384,r=8,p=1$<base64-salt>$<base64-hash>`.
   - `verifyPassword(plaintext: string, stored: string): Promise<boolean>` — parses the stored string, re-derives, compares with `crypto.timingSafeEqual`. Returns false on any parse error.
   - Unit tests in `backend/tests/passwords.test.ts` covering: hashes are unique per call (different salt), verify succeeds with the original, verify fails with a wrong password, verify fails on malformed input.

### Phase 3 — Sessions and the new actor middleware

4. **Implement `services/sessions.ts`.** Functions:
   - `createSession(db, userId, idleDays): { id, expiresAt }` — generates a random 32-byte session id, inserts row, returns id.
   - `resolveSession(db, sessionId): { userId, expiresAt } | null` — looks up by id, returns null on miss or expiry.
   - `bumpLastSeen(db, sessionId)` — updates `last_seen_at`.
   - `deleteSession(db, sessionId)`.
   - `deleteSessionsForUser(db, userId, exceptSessionId?)`.

5. **Rewrite `auth/actor.ts`.** Replace the `X-User-Id` resolver with one that:
   1. If `Authorization: Bearer fjord_...` is present, calls `services/api_tokens.ts → verifyBearer`. On success, resolve the user.
   2. Else if `fjord_session` cookie is present, calls `resolveSession`. On success, resolve the user.
   3. Else return 401.

   The function still returns the same `Actor` shape so downstream policy code is unchanged. Add `req.actor` decoration in [backend/src/server.ts](../../backend/src/server.ts) as today; replace the preHandler that read `X-User-Id`.

   **Also delete:** the `FJORD_AUTH_TOKEN` middleware block (lines 56-65 of `server.ts`) and the `/api/auth/validate` route (lines 139-147).

6. **Add config knobs.** In [backend/src/config.ts](../../backend/src/config.ts):
   - Remove `FJORD_AUTH_TOKEN` (`config.authToken`).
   - Add `FJORD_BOOTSTRAP_PASSWORD` (optional string; zod `.optional()`).
   - Add `FJORD_SESSION_IDLE_DAYS` (optional number, default 30).

### Phase 4 — Auth endpoints

7. **Create `routes/auth.ts`** registering:
   - `POST /api/auth/login` — body `{ handle?: string, password?: string }`. In **demo mode**, ignore the body and issue a session for `default-administrator`. In **prod mode**, look up the user by `handle`; reject if `kind !== 'human'`, soft-deleted, or unknown; verify password if `password_hash IS NOT NULL`, else accept any submission (passwordless-once). On success, create a session, set `Set-Cookie: fjord_session=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<idle-seconds>`, return `{ actor, requires_password_set: <hash is null in prod> }`.
   - `POST /api/auth/logout` — deletes the current session row, clears the cookie. 204.
   - `POST /api/auth/logout-all` — deletes all sessions for the current actor. 204.
   - `POST /api/auth/change-password` — body `{ current_password?: string, new_password: string }`. If the actor's `password_hash IS NULL`, ignore `current_password`. Otherwise require it and verify. Hash `new_password`, update the user row, delete all other sessions for this user (keep current). 204.
   - `GET /api/auth/me` — returns the actor or 401.

   These routes go through the normal auth middleware except `POST /api/auth/login`, which must be in the `ACTOR_SKIP` allow-list.

8. **Add the CSRF custom-header check.** In the auth preHandler (or as a separate hook), reject write methods (POST/PATCH/DELETE) without `X-Requested-With: fjord` when authenticated via cookie. Bearer-authenticated callers are exempt (no ambient credential, no CSRF risk).

### Phase 5 — Bootstrap and startup warning

9. **Hook bootstrap into startup.** Extend `seedDefaultAdministrator` (in [backend/src/server.ts](../../backend/src/server.ts)) so that after ensuring the row exists:
   - If `password_hash IS NULL` and **not in demo mode**:
     - If `config.bootstrapPassword` is set, hash it with `services/passwords.ts` and update the row.
     - Else log a `WARN`-level message via `app.log.warn`: `"default-administrator has no password set. The server is accepting unauthenticated logins as administrator. Set FJORD_BOOTSTRAP_PASSWORD on a fresh install, or log in and set a password through the UI."`
   - In demo mode, no-op (warning suppressed, env var ignored).

### Phase 6 — API tokens

10. **Implement `services/api_tokens.ts`.** Functions:
    - `generateToken()`: 20 random bytes → base32 lower → prepend `fjord_`. Compute `lookupHash` = `crypto.createHash('sha256').update(token).digest('hex')` and `tokenHash` = `hashPassword(token)`. Compute `preview` = `fjord_<first 4 of random>...<last 4 of random>`.
    - `issueToken(db, userId, name, expiresAt?)`: insert row, return `{ id, plaintext, ...nonSecretFields }`.
    - `verifyBearer(db, headerValue)`: parse and validate prefix/length, compute SHA-256, look up by `lookupHash`, check `revokedAt`/`expiresAt`, then verify scrypt against `tokenHash`. On success, bump `lastUsedAt` (debounced same as sessions). Returns `{ userId } | null`.
    - `revokeToken(db, id)`: sets `revokedAt = now`.

11. **Create `routes/tokens.ts`** registering:
    - `POST /api/users/:id/tokens` — body `{ name: string, expires_at?: string (ISO8601) }`. Policy: actor is Admin OR actor.id === :id. Returns `{ id, name, preview, created_at, expires_at, token: <plaintext, shown once> }`.
    - `GET /api/users/:id/tokens` — same policy. Returns all tokens for that user (id, name, preview, created_at, last_used_at, expires_at, revoked_at). Query param `?include_revoked=true` to include revoked tokens.
    - `DELETE /api/users/:id/tokens/:token_id` — same policy. Sets `revoked_at`. 204.

12. **Wire up in `server.ts`.** Register the new routes after the existing user/task/etc. routes.

### Phase 7 — Admin reset and CLI

13. **Extend `PATCH /api/users/:id` to support admin password reset.** In [backend/src/routes/users.ts](../../backend/src/routes/users.ts):
    - Add `password_hash: null` as the **only** legal value for a `password_hash` field in the PATCH body. Policy: admin only.
    - When this PATCH succeeds with `password_hash: null`, also call `deleteSessionsForUser(targetId)` so the existing sessions are killed.
    - (Optional but cheap: same when *any* `password_hash` change happens via change-password — covered in step 7's logout-other-sessions step.)
    - Keep all other field semantics unchanged.

14. **Create the reset-admin-password CLI.** At `backend/src/scripts/reset-admin-password.ts`:
    ```ts
    import { openDatabase, runMigrations } from "../db/index.js";
    import { users } from "../db/schema.js";
    import { eq } from "drizzle-orm";

    const dbPath = process.env.FJORD_DB_PATH ?? "./data/fjord.db";
    const handle = openDatabase(dbPath);
    runMigrations(handle);
    handle.db.update(users).set({ passwordHash: null })
      .where(eq(users.id, "default-administrator")).run();
    console.log(`default-administrator password cleared at ${dbPath}.`);
    console.log("Restart the server (set FJORD_BOOTSTRAP_PASSWORD to seed a known one)");
    console.log("or log in as 'admin' with no password to set a new one in the UI.");
    handle.close();
    ```
    Add to [backend/package.json](../../backend/package.json) scripts: `"reset-admin-password": "tsx src/scripts/reset-admin-password.ts"`. Add to root [package.json](../../package.json) scripts: `"reset-admin-password": "npm run reset-admin-password -w @fjord/backend"`.

### Phase 8 — Frontend

15. **Update the API client.** In [frontend/src/lib/api.ts](../../frontend/src/lib/api.ts):
    - Delete the code that reads the local user id and sets `X-User-Id`.
    - Add `credentials: "include"` to every `fetch` call so the session cookie is sent.
    - Add `X-Requested-With: fjord` header on POST/PATCH/DELETE.
    - On 401: emit an auth event (or directly redirect) so the auth gate re-renders the login page.

16. **Rewrite the auth gate.** Replace [frontend/src/lib/auth.ts](../../frontend/src/lib/auth.ts) and [frontend/src/components/AuthGate.tsx](../../frontend/src/components/AuthGate.tsx) with:
    - A React Query hook `useCurrentUser()` that calls `GET /api/auth/me`.
    - An `AuthGate` component that, while loading, shows a spinner; on 401, renders `<LoginPage>`; on success, renders children. If the resolved actor has `requires_password_set: true`, renders `<SetPasswordPage>` instead of children.
    - Demo mode short-circuit: if `/api/config` reports `demo: true`, the `AuthGate` calls `POST /api/auth/login` with no body on mount before rendering anything else.

17. **Create `LoginPage.tsx`.** Two fields (`Handle`, `Password`). Submit handler calls `POST /api/auth/login` with `{ handle, password }`. Show errors inline (401 → "invalid credentials", 400 → user input issue). On success, invalidate `useCurrentUser` and let the auth gate re-render.

18. **Create `SetPasswordPage.tsx`.** Two fields (`New password`, `Confirm`). Submit calls `POST /api/auth/change-password` with no `current_password`. On success, invalidate `useCurrentUser`; the auth gate falls through to the normal app.

19. **Remove `UserPicker` and the localStorage user logic.** Delete [frontend/src/components/UserPicker.tsx](../../frontend/src/components/UserPicker.tsx). Remove all references — `Header.tsx`, any callers, `lib/user.ts`. Replace the header's "Acting as" UI with a user menu showing `display_name` + avatar, with a dropdown containing "Change password", "API tokens", "Log out".

20. **Add `ChangePasswordDialog`.** Three inputs (`Current`, `New`, `Confirm`). Submit calls `POST /api/auth/change-password`.

21. **Add API token management UI.** On the user's `/users/:handle` page (UserCard), if the viewer is the user themselves or an admin, render a "API tokens" section:
    - `TokenList` — renders existing tokens with revoke buttons (soft-delete reflected as a disabled row + revoked timestamp).
    - "Create token" button opens `TokenCreateDialog` (name + expiry preset). On success, shows the plaintext token in a one-time modal with a copy button and a "I've saved it" dismiss action.

22. **Update the SSE hook.** In [frontend/src/lib/stream.ts](../../frontend/src/lib/stream.ts), remove the `X-User-Id` parameter from the EventSource URL (the browser sends the cookie automatically). Verify connection still authenticates.

### Phase 9 — Documentation

23. **Rewrite the relevant CLAUDE.md sections.** Specifically:
    - "Key constraints" section: replace the no-authentication bullet with a description of password+session auth, demo-mode exception, and API tokens.
    - "Frontend architecture → Data flow": remove the `X-User-Id`/localStorage bullet; replace with session-cookie flow.
    - "Configuration" section: remove `FJORD_AUTH_TOKEN`; add `FJORD_BOOTSTRAP_PASSWORD`, `FJORD_SESSION_IDLE_DAYS`.
    - "API overview" intro: remove "All write endpoints require `X-User-Id` header"; replace with "All authenticated endpoints require either a session cookie (`fjord_session`) or `Authorization: Bearer fjord_...`".
    - Add a brief "Auth" subsection listing the new endpoints.

24. **Update the README.** Add a "Recovery" section documenting `npm run reset-admin-password` and the Docker invocation pattern.

### Phase 10 — Demo seed

25. **Verify and extend `backend/demo/seed.sql`.** Confirm no `token_hash` references remain (they shouldn't — the column will be dropped by the migration before the seed runs, but the seed must not reference it either). Optionally add 1-2 `api_tokens` rows for agent users so the demo shows the token-management UI populated. Example:

    ```sql
    INSERT INTO api_tokens (id, user_id, name, lookup_hash, token_hash, preview, created_at)
    VALUES
      ('token-demo-1', 'agent-backend', 'demo-token-backend',
       '<sha256 of a known string>',
       '<scrypt hash of the same string>',
       'fjord_demo...0001',
       '2025-02-01T00:00:00Z');
    ```

    The plaintext doesn't matter (demo resets periodically and visitors are always logged in as admin, not as agents); the row exists to populate the UI. Add a comment in the seed file explaining this.

## Demo seed data

Covered in step 25 above. The plan adds two new tables (`sessions`, `api_tokens`) but only `api_tokens` is worth seeding; `sessions` is purely runtime state that does not need fixture data. The seed should include at least one revoked token to demonstrate the "show revoked" toggle in the management UI.

## Testing strategy

### Backend unit + integration tests (vitest, `backend/tests/`)

- `tests/passwords.test.ts` (new) — hashing/verifying.
- `tests/sessions.test.ts` (new) — create/resolve/expire/delete; bumpLastSeen debounce.
- `tests/api_tokens.test.ts` (new) — token generation, dual-hash verification, revoke, expire, last-used bump.
- `tests/auth.test.ts` (new) — login (prod + demo + bad creds), logout, logout-all, change-password (with and without current), passwordless-once flow, force-change-on-write gate.
- `tests/bootstrap.test.ts` (new) — FJORD_BOOTSTRAP_PASSWORD seeds; missing env var → warning emitted; demo mode → both suppressed.
- Update existing tests that send `X-User-Id` headers — they will all need to issue a session via `POST /api/auth/login` first and propagate cookies via `app.inject({ cookies: { fjord_session: ... } })`. Add a `tests/helpers/auth.ts` helper that returns a logged-in injector.
- Regression: every existing test under `backend/tests/` must continue to pass after this migration.

### Manual frontend checks (no component test framework)

Walk through these in a browser against `npm run dev`:

- Fresh install (no `FJORD_BOOTSTRAP_PASSWORD`): server starts, warning visible in logs. Log in as `admin` with no password → forced to set-password → app loads normally.
- Fresh install with `FJORD_BOOTSTRAP_PASSWORD=correct horse battery staple`: same, but the set-password page is *not* shown after first login (hash is set, force-change rule satisfied).
- Login with wrong password → 401, error shown inline.
- Logout → redirected to login page; the back button does not bypass the gate.
- Change own password → next request still works (cookie unchanged); other sessions (if any) would be invalidated.
- Admin clicks "Reset password" on user `bob` → `bob`'s next login is passwordless → `bob` is forced to set-password.
- Issue an API token for a human user → plaintext shown once → copy → close modal → token visible in list with correct preview → revoke → row dimmed with revoked timestamp.
- Hit `/api/tasks` from `curl` with `Authorization: Bearer <issued-token>` → 200. With a revoked token → 401.
- Demo mode (`FJORD_DEMO=true`): browser opens → no login page → board renders → reload preserves session until the DB resets.
- `npm run reset-admin-password` clears the hash; subsequent login is passwordless.

### Regression risk

- The SSE stream now relies on the session cookie; if the browser doesn't send it (e.g., reused `EventSource` from an unauthenticated state), streaming breaks silently. Manual check: refresh page after login, verify task moves from another tab arrive in real time.
- Any external integration that was using `X-User-Id` directly (e.g., scripts that hit the API) will break. They must switch to API tokens. Document in CLAUDE.md.

## Acceptance criteria

- [ ] `users.password_hash` column added, `users.token_hash` dropped, migration applied cleanly to a fresh DB.
- [ ] `sessions` and `api_tokens` tables exist with the schema from ADR-0010.
- [ ] `POST /api/auth/login`, `/logout`, `/logout-all`, `/change-password`, `GET /api/auth/me` implemented and tested.
- [ ] `POST/GET/DELETE /api/users/:id/tokens` implemented and tested.
- [ ] `FJORD_BOOTSTRAP_PASSWORD` honored on first boot when admin hash is null; ignored otherwise; ignored in demo mode.
- [ ] Startup warning emitted when admin hash is null and not in demo mode.
- [ ] `npm run reset-admin-password` clears the default-administrator's `password_hash` and prints recovery instructions.
- [ ] `X-User-Id` header is rejected (or simply ignored — the new middleware does not look at it).
- [ ] `FJORD_AUTH_TOKEN` is no longer read; `/api/auth/validate` no longer exists.
- [ ] Demo mode logs visitors in as `default-administrator` on app load with zero clicks.
- [ ] In prod mode, a human with `password_hash IS NULL` can log in once and is immediately forced to set a password before any write request succeeds.
- [ ] Agents can authenticate with `Authorization: Bearer fjord_...`; revoked and expired tokens are rejected.
- [ ] Frontend `UserPicker` and localStorage `X-User-Id` logic are deleted; user menu in header replaces them.
- [ ] [CONTEXT.md](../../CONTEXT.md), [CLAUDE.md](../../CLAUDE.md), and [README.md](../../README.md) are updated.
- [ ] [backend/demo/seed.sql](../../backend/demo/seed.sql) compiles against the new schema and includes at least one example `api_tokens` row.
- [ ] All existing tests pass (`npm test` from root).
- [ ] Typechecks clean (`npm run typecheck` in both `backend/` and `frontend/`).

## Open questions

None — all design decisions resolved during grilling. The three new ADRs ([ADR-0008](../adr/0008-password-authentication.md), [ADR-0009](../adr/0009-password-hash-format.md), [ADR-0010](../adr/0010-api-token-format-and-storage.md)) record the trade-offs and rejected alternatives.

## Out-of-band work

- **Issue #84** — switch from `better-sqlite3` to `node:sqlite`. Independent. This plan stays compatible by avoiding any new native dependencies (scrypt is in `node:crypto`; no `argon2` install).
- **Future** — "active sessions" management UI on the profile page. The `sessions` table makes this a small additive feature; not scheduled.
- **Future** — 2FA / WebAuthn / OIDC. All cleanly additive on top of this design.
