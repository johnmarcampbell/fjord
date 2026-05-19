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

- A **User** has exactly one **Kind**, one **Handle**, one **Display name**, and one **Avatar**.
- A **Task** is reported by one **User** and optionally assigned to one **User**.
- A **Task** is blocked by zero or more other **Tasks** via **Blocker** edges.
- A **Task** belongs to one **Space** and at most one **Project**.

## Flagged ambiguities

- **"Role"** was overloaded between (a) a User's free-text job description and
  (b) a permissions grant. Resolved: the job description is **Title**.
  Permissions are a separate concept deferred to issue #60 and intentionally
  not represented in the schema until then.
