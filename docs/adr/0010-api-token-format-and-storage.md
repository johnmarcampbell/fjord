# API token format and storage

[ADR-0008](0008-password-authentication.md) introduces **API tokens** —
long-lived bearer credentials for programmatic callers, distinct from human
**Sessions**. This ADR pins down the token format, the storage schema, and
the verification path.

## Decision

### Token format

```
fjord_<32 base32 lower characters>
```

Total length 38. Example: `fjord_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`.

- `fjord_` prefix identifies the credential kind and lets secret scanners
  (GitHub, gitleaks) detect leaks.
- 32 base32 characters = 160 bits of entropy. Base32 lower is URL-safe,
  case-insensitive in scanner defaults, and avoids the `I/l/1/O/0` lookalikes
  that hurt copy-paste UX.

### Storage schema

New `api_tokens` table:

```
id            text primary key (uuid)
user_id       text not null references users(id) on delete cascade
name          text not null      -- human label: "openclaw-prod", "alice cli"
lookup_hash   text not null unique  -- SHA-256(token), fast O(1) lookup
token_hash    text not null      -- scrypt(token), authoritative auth check
preview       text not null      -- "fjord_a1b2...o5p6" (prefix + first 4 + last 4)
created_at    text not null
last_used_at  text               -- nullable, debounced like sessions
expires_at    text               -- nullable, null = never expires
revoked_at    text               -- nullable, soft-delete for audit
```

### Verification path

On any request with `Authorization: Bearer fjord_...`:

1. Reject malformed prefixes/lengths cheaply without a DB hit.
2. Compute `SHA-256` of the submitted token; look up the row by `lookup_hash`.
3. If the row exists and is not revoked or expired, verify the submitted
   token against `token_hash` (scrypt). The scrypt verify is the authoritative
   check; the SHA-256 step is only an index.

### Why two hashes

scrypt is intentionally slow and salted per-row — perfect for credential
storage but unusable for an O(1) database lookup. SHA-256 with no salt is
fast and deterministic — perfect for an index but unsafe as the sole stored
credential (no per-row work factor, trivially brute-forceable if the database
leaks). Splitting roles between two columns gives us both properties:

- `lookup_hash` is fast, deterministic, and indexed for O(1) lookup.
- `token_hash` is slow, salted, and the actual authority for "did this token
  match?"

If the database leaks, an attacker who steals `lookup_hash` learns nothing
useful (it's a hash of an unknown 160-bit secret). The scrypt hash gives them
the same protection as any other scrypt-stored credential.

### Creation, listing, revocation

- `POST /api/users/:id/tokens` — `{ name, expires_at? }`. Returns the
  plaintext token exactly once in the response. Policy: actor must be Admin
  or the target user themselves.
- `GET /api/users/:id/tokens` — returns id, name, preview, created_at,
  last_used_at, expires_at, revoked_at. Never the plaintext or either hash.
  Same actor policy.
- `DELETE /api/users/:id/tokens/:token_id` — sets `revoked_at`. Soft-delete
  so revoked tokens remain visible in the management UI (toggle to view).
  Same actor policy.

### Expiry

Default is never-expires. UI offers presets (30 days, 90 days, 1 year,
Never). Past `expires_at`, auth fails with the same error as a revoked token.

## Rejected alternatives

- **Random opaque ID with no prefix.** Loses secret-scanner detection of
  leaked tokens. The 6-byte `fjord_` prefix is cheap insurance.
- **`token_hash` alone (no `lookup_hash`).** Forces a full table scan of
  scrypt-verifies per auth attempt. Tolerable at our scale but
  catastrophically bad once the table grows; better to pay the small storage
  cost now.
- **`lookup_hash` alone (no scrypt).** Database leak ⇒ all tokens are
  immediately usable. Unacceptable.
- **Scopes / fine-grained permissions on tokens.** Out of scope. Tokens
  inherit the issuing user's role. Future work if needed.
