# Password hash algorithm and format

Passwords introduced by [ADR-0008](0008-password-authentication.md) are stored
in `users.password_hash`. We use **scrypt** from Node's `crypto` module — not
argon2id, not bcrypt.

## Decision

- Algorithm: `crypto.scrypt` (Node stdlib).
- Parameters: `N=16384, r=8, p=1` (OWASP-acceptable defaults for scrypt). Hash
  output length: 64 bytes. Salt: 16 random bytes from `crypto.randomBytes(16)`,
  generated per-password.
- Verification: `crypto.timingSafeEqual` to compare derived hashes.
- Storage format: a single self-describing string

  ```
  scrypt$N=16384,r=8,p=1$<base64-salt>$<base64-hash>
  ```

  so the parameters travel with the hash. Future parameter increases can be
  rolled out by re-hashing on next successful login without a schema migration.

## Why scrypt, not argon2id

argon2id is OWASP's #1 recommendation and was our initial instinct. Two
factors moved us off it:

1. **No third-party native dependency.** scrypt is in `node:crypto`. The
   `argon2` npm package is a native module requiring `node-gyp` (and a C++
   toolchain) for any platform without a prebuild. We are actively trying to
   reduce native dependencies — see [issue #84](https://github.com/johnmarcampbell/agentic_kanban/issues/84),
   which proposes dropping `better-sqlite3` for `node:sqlite`. Picking argon2id
   here would directly conflict with that direction.
2. **scrypt is OWASP-acceptable.** It is memory-hard, salted per-row, and
   tuned to the same security ballpark as argon2id at the recommended
   parameters. There is no meaningful security gap for this app's threat
   model (self-hosted internal tool, no public signup).

## Why not bcrypt

bcrypt is not memory-hard, caps password input at 72 bytes, and ranks below
both argon2id and scrypt on the current OWASP cheat sheet. No reason to pick
it over scrypt in 2026.

## Rotation strategy

If we ever need to raise the work factor:

1. Bump the constants in code.
2. On every successful login, if the stored hash's parameters are lower than
   current, re-derive with the new parameters and update the row.

The self-describing format makes this a code change with no migration.
