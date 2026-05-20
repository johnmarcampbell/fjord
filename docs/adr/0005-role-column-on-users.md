# Add `role` column to `users` (supersedes ADR-0001)

Issue #60 introduces a two-tier permissions model: a global **Role**
(`Admin` | `Member`) and per-space **Space access** grants. The global role
is exclusive, binary, and applies system-wide, so it lives as a `role` column
on the `users` table. Per-space grants live in a separate `user_space_access`
table.

This supersedes ADR-0001, which deferred any role column out of #57 because
the permissions model was undecided. The model is now decided. ADR-0001's
concern was about pre-committing prematurely; resolving #60 removes that
concern.

Rejected alternative: model the global role via a wildcard row in the grants
table (e.g. `space_id = '*'` means admin-everywhere). This forces every
permission query to special-case a magic value, and conflates two genuinely
different concepts — a tier (what kind of user are you?) and a grant (which
spaces can you see?). Keeping them in separate tables matches the domain.
