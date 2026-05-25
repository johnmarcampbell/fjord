# Space access carries affiliation, not just permission

Issue #95 broadens what a row in `user_space_access` means. Until now the row was strictly a permission grant for a **Member** — **Admins** never needed one because their **Role** granted access to every **Space**. From this change forward, the row is an *explicit affiliation* between a **User** and a **Space**, with two layered meanings: for a **Member** it still grants permission; for an **Admin** it grants no new permission (their **Role** already does) but it is what causes them to appear in that space's "People in this Space" list, the assignee picker, and the SSE event stream for that space.

The motivation is social, not technical: in any space larger than a personal workspace, a **Member** needs to know which **Admins** are actually collaborating here versus which **Admins** are merely operationally responsible for the install. The pre-existing "Admins implicitly belong to every space" rule made that distinction impossible to draw.

The shape of the change:
- The auth middleware now decorates `Actor` with a new `affiliatedSpaceIds: Set<string>` field (always the explicit owned-or-granted set, never `"all"`), in addition to the existing `accessibleSpaceIds: Set<string> | "all"` field used for permission decisions. The two fields diverge only for **Admins**.
- "People in this Space" surfaces (member list, assignee picker, "Bring someone into this Space" combobox, SSE event filter) use `affiliatedSpaceIds`.
- Authorization checks (`canAccessSpace`, `canManageSpace`, etc.) continue to use `accessibleSpaceIds`, so **Admins** keep their global powers regardless of where they have chosen to affiliate.
- `POST /api/spaces/:id/access` drops its `400 if user is Admin` guard so **Admins** can be granted (or self-grant) like anyone else. No migration backfill — **Admins** appear in spaces they own via the existing **Space Owner** implicit-access rule and join other spaces explicitly.

## Considered alternatives

- **Keep `accessibleSpaceIds === "all"` and just filter the affiliation list at every call site.** Rejected because the filter logic would have to be reinvented in every place that today reads `accessibleSpaceIds`, and the meaning of the field would silently change without the type changing.
- **Introduce a separate "affiliation" table distinct from `user_space_access`.** Rejected because the table already has the right shape — one row per (user, space) — and a second table would force every join to consult both. The row's *meaning* shifts by **Role**, but its *structure* does not.
- **Backfill every existing Admin into every existing space at migration time** (so the day-1 experience is unchanged). Rejected because it defeats the social signal on day 1 for every existing space — the change only starts mattering when those spaces age out, which could be years. **Admins** retain access via the **Owner** shortcut for spaces they created; anything beyond that is a deliberate self-join.

## Consequences

- The phrase "has access" is no longer accurate UI verbiage for what the grant row signals — surfaces now say "People in this Space" and "Bring someone into this Space" instead of "People with access" and "Grant access to a Member…".
- A non-affiliated **Admin** who needs to act in a space they have not joined will not appear in that space's assignee picker until they join. This is a deliberate friction, mitigated by a one-click "Join this Space" affordance on the space page.
- The SSE stream filters by `affiliatedSpaceIds`, so an **Admin** who has not joined a space will not receive live updates from it (though they can still read it via REST).
