# Default Administrator user

Every install — fresh or upgraded — has a built-in **User** with reserved id
`default-administrator`, handle `admin`, and `role = 'Admin'`. It cannot be
deleted (`DELETE` returns 400), its role cannot be changed (`PATCH role`
returns 400), and its handle cannot be changed (`PATCH handle` returns 400).
Other profile fields (display name, title, bio, avatar) are editable like any
user.

This makes "at least one Admin always exists" a structural invariant rather
than a runtime check on every user deletion. The handle `admin` is already in
the reserved-handles list, so this user is the only entity permitted to hold
it.

On startup the backend creates the row if it does not already exist, so the
invariant holds across fresh installs, migrations, and accidental data wipes
of the users table.
