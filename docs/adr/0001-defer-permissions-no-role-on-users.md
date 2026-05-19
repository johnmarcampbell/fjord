# Defer permissions: no `role_global` on users

Issue #57 originally proposed a nullable `role_global` enum on the `users` table
as a placeholder for the future Admin/User permissions concept. We dropped it.
Permissions are a *grant*, not a property of the person — putting them on the
user row pre-commits to "one global role per user" before we've thought through
whether grants should be per-space, multi-valued, or live in their own table.
That design decision belongs in issue #60, not pre-empted here. As a side
benefit, dropping the column frees the word "role" so the bio-line field can be
named `title` and "role" can later mean exactly one thing: a permissions grant.
