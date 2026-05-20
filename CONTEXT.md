# agentic-kanban

A small Kanban board for collaboration between one or two humans and agents,
deployed inside a trusted gateway alongside Openclaw.

## Language

### Actors

**User**:
A participant on the board — either a human or an agent. Identified by an `id`,
addressed by a `handle`.
_Avoid_: account, member.

**Kind**:
What sort of actor a **User** is (`human` | `agent`). Editable.
_Avoid_: type, role.

**Handle**:
A **User**'s short, unique, URL-safe name (e.g. `jane`, `agent-coder`). Used for
`@mentions` and the user-view URL. Lowercased; matches `^[a-z0-9_-]{1,32}$`.
_Avoid_: username, slug, login.

**Display name**:
A **User**'s human-readable name (e.g. "Jane Wong"). Free text; not unique.
_Avoid_: full name, label.

**Title**:
A **User**'s self-described job or function (e.g. "backend engineer"). Free
text, profile flavor only. Not a permission grant.
_Avoid_: role, position.

**Bio**:
A one-or-two-sentence self-description on a **User**'s profile. Free text.

**Avatar**:
A **User**'s visual identifier — either a single emoji (default) or an image
URL. Every user has one; backfilled with a random pick from a curated emoji
list for existing users.

**Role**:
A **User**'s global permission level: `Admin` or `Member`. Determines what they
can do across the whole system. Distinct from **Title** (free-text job
description) and from **Space access** (per-space grants).
_Avoid_: permission, level.

**Member**:
A non-**Admin** **Role** — the default. Used only as a role name; do _not_ use
"member" to refer to a **User** in general (that's just "user").
_Avoid_: using for actors-in-general.

**Space access**:
A grant that lets a **Member** see and act within a specific **Space**.
**Admin** **Users** have implicit access to every **Space** and do not need
grants. **Space Owners** have implicit access to spaces they own. Modeled as
a row in a grants table; not a property of the **User**.
_Avoid_: membership, role-in-space.

**Space Owner**:
The **User** who created a **Space**. Recorded on the space row, not as a
grant. Owners have implicit access to their own space and can grant/revoke
**Space access**, edit the space's name/description, and archive it.
Distinct from **Role** — a **Member** can be a Space Owner of spaces they
created. **Admins** can manage any space without needing to be the owner.
_Avoid_: creator, manager.

### Board

**Column**:
One of the five fixed lanes a **Task** lives in: `Backlog`, `To Do`,
`In Progress`, `In Review`, `Done`. Not customizable.

**Task**:
A unit of work on the board. Has a **Column**, a `reported_by` **User**, and
optionally an `assigned_to` **User**.

**Blocker**:
A directed edge between two **Tasks**: task A is blocked by task B until B
reaches `Done`. Cycles are rejected.

**Space**:
A top-level grouping of **Projects** and **Tasks**. Every task belongs to
exactly one space; the default space is `default`.

**Project**:
An optional grouping of **Tasks** within a **Space**.

### Events

**Comment**:
A markdown note on a **Task** for cross-actor communication, visible to all.

**Journal entry**:
A durable working note on a **Task** owned by the assignee — the agent's
working memory for itself, not cross-actor communication.

**Task event**:
A timeline entry on a **Task**: either a **Comment**, a **Journal entry**, or
a system-recorded change (column change, blocker added, etc.).

## Relationships

- A **User** has exactly one **Kind**, one **Handle**, one **Display name**, one **Avatar**, and one **Role**.
- A **Member** has zero or more **Space access** grants. **Admins** do not need grants.
- Every **Space** has exactly one **Space Owner** — the **User** who created it.
- A **Task** is reported by one **User** and optionally assigned to one **User**.
- A **Task** is blocked by zero or more other **Tasks** via **Blocker** edges.
- A **Task** belongs to one **Space** and at most one **Project**.

## Flagged ambiguities

- **"Role"** was overloaded between (a) a User's free-text job description and
  (b) a permissions grant. Resolved: the job description is **Title**; **Role**
  is the global Admin/Member level.
- **"User"** was almost overloaded again as the name for the non-Admin role.
  Resolved: the non-Admin role is **Member**. "User" remains exclusively the
  actor term.
