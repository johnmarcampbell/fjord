# Open space creation; introduce Space Owner

Issue #60's first draft made all space CRUD Admin-only. We softened this:
any **User** (Admin or Member) can create a **Space**, and the creator
becomes its **Space Owner**. Owners can grant/revoke **Space access**,
edit the space's name/description, and archive their own space. Admins
can do all of these on any space.

The motivating scenario: a new Member with zero grants should not be
inert. They can create a personal space to start doing work, then invite
collaborators when ready. Without this, every new Member would have to
wait for an Admin to provision them.

Recording the owner requires a `created_by` column on `spaces`. Existing
spaces (the seeded `default` space and any others) are backfilled with
`created_by = 'default-administrator'`. Ownership is non-transferable in
this issue — if the owner is soft-deleted, the space stays owned by them
(inert grant); an Admin can still manage it.

Rejected alternative: keep space CRUD Admin-only and require Admins to
provision every Member's workspace. Simpler policy table, but defeats
self-service collaboration in a tool that's meant to lower friction for
humans-and-agents working side by side.
