# User creation lives on `/users`, not in the header user picker

Before issue #59 the header `UserPicker` carried a `+ Add identity` inline form
that created users on the spot — sensible when a "User" was just an `id` + a
`display_name` + a `kind`. After #57 a User has `handle`, `title`, `bio`, and
`avatar` too, and the create flow needs an avatar picker and a real form. We
considered keeping the inline form and growing it, but stuffing six fields and
an emoji grid into the header would crowd controls that exist for the active
task workflow. Instead, all user creation moves to the new `/users` page as a
`+ New user` tile in the card grid, sharing one `UserFormDialog` component with
self-edit. The `UserPicker` shrinks to a pure "Acting as" selector. On a fresh
install (no users) the app auto-redirects to `/users` so the picker never
becomes a dead end. Reversal cost is moderate: re-adding header creation later
is straightforward, but the muscle memory of "create users in the header" will
be gone — that is the intended trade-off.
