# Password authentication replaces trusted-gateway identity model

Issue #80 introduces real authentication. Today the app relies on a trusted
gateway and identifies callers by an `X-User-Id` header selected from a UI
picker. That posture is intentional for Openclaw-alongside deployments but
unusable when the app is exposed directly. Rather than layering optional
password auth on top of the header model, we **replace** the header model.

## Decision

- Humans authenticate with a **Password** (see CONTEXT.md). On `POST /api/auth/login`
  the server verifies the password and issues a **Session** — an opaque opaque
  session id stored in a new `sessions` table and carried in an `HttpOnly;
  Secure; SameSite=Lax` cookie.
- Agents authenticate with **API tokens** — long-lived bearer credentials sent
  as `Authorization: Bearer fjord_...`. Humans may also hold API tokens for CLI
  use. See [ADR-0010](0010-api-token-format-and-storage.md) for the format.
- The `X-User-Id` header, the localStorage `UserPicker`, the `FJORD_AUTH_TOKEN`
  shared-bearer mode, and `resolveActor`'s auto-create-on-unknown-header
  behavior are all **removed**. There is no header-trust escape hatch.
- The auth middleware accepts either an `Authorization: Bearer` token (checked
  first) or an `fjord_session` cookie; both resolve to the same `Actor` shape.
- A new `password_hash` column on `users` replaces the dead `token_hash`
  column. Hash format is documented in [ADR-0009](0009-password-hash-format.md).
- CSRF on the cookie path is mitigated by `SameSite=Lax` plus a required
  `X-Requested-With: fjord` header on writes. No CSRF token table.

## Bootstrap

On startup, if `default-administrator` has `password_hash IS NULL`:

- If `FJORD_BOOTSTRAP_PASSWORD` is set, hash it with scrypt and store it.
- Otherwise, leave the column null and emit a startup warning:
  `default-administrator has no password set; the server is accepting
  unauthenticated logins as administrator`.

`FJORD_BOOTSTRAP_PASSWORD` is honored **only** when the hash is null, so it
cannot override an existing password. Operators who forget the admin password
run `npm run reset-admin-password`, which sets `password_hash` back to null;
they can then either set `FJORD_BOOTSTRAP_PASSWORD` and restart, or log in
passwordless and set a new one in the UI.

## Passwordless-once login

The login endpoint accepts a submission as valid when:

```
user.kind = 'human'
AND (user.password_hash IS NULL OR scrypt-verify(submission) succeeds)
```

A user with no password set can log in once without one. After such a login,
write endpoints reject the actor (with a hint pointing at the set-password
flow) until they set a password. This rule serves three flows with one code
path:

1. The default administrator after bootstrap with no env var.
2. A newly-created non-admin user (provisioned by an admin with no initial
   password; the admin tells them their handle out of band).
3. A user whose password an admin has reset (the reset action sets
   `password_hash` back to null).

The rule is silenced in demo mode.

## Demo mode

Demo mode is a first-class feature and explicitly bypasses password checks.
On the **login endpoint** (not the auth middleware), demo mode accepts
`POST /api/auth/login` with no body and issues a session cookie for
`default-administrator`. Every demo visitor becomes the default
administrator; there is no user picker. Personas in
`backend/demo/seed.sql` exist for the board's contents (task assignees,
commenters, journal authors) but no one logs in as them.

`FJORD_BOOTSTRAP_PASSWORD`, the force-set-password rule, and the
no-password-set startup warning are all suppressed in demo mode.

## Sessions

- Server-side, not stateless. A `sessions` table holds
  `(id, user_id, created_at, last_seen_at, expires_at)`. Picked over signed
  cookies because we want revocation (password change kills other sessions;
  admin reset kills all of them) and don't need horizontal scale.
- Idle expiry only, configurable via `FJORD_SESSION_IDLE_DAYS` (default 30).
  No absolute cap.
- `last_seen_at` is updated on every authenticated request; the response
  re-issues the cookie at most once per hour to avoid hammering `Set-Cookie`.
- Endpoints: `POST /api/auth/login`, `POST /api/auth/logout`,
  `POST /api/auth/logout-all`, `POST /api/auth/change-password`,
  `GET /api/auth/me`.

## Rejected alternatives

- **Layered (auth becomes opt-in via an env var).** Doubles the code paths
  and creates a "is the gateway header trusted right now?" runtime question.
  If the operator misconfigures, the failure mode is silent privilege escalation.
- **Coexist (trust the gateway header when present, otherwise require login).**
  Same runtime-trust problem, with a worse failure mode if the header is
  forgeable from outside.
- **Stateless JWT-style cookies.** No DB lookup is the only real upside, and
  it doesn't matter at our scale. Loses easy revocation and forces us to
  manage a signing-secret rotation story.
- **Public signup.** Out of scope — this is an internal kanban board.
