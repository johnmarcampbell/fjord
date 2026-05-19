# Implementation plan — Issue #57: Richer user profile

This plan is self-contained. Execute it top-to-bottom. The repo is
`agentic-kanban`; read [CLAUDE.md](../../CLAUDE.md) for monorepo conventions
and [CONTEXT.md](../../CONTEXT.md) for domain terminology. The deviations from
the issue text are recorded in
[ADR-0001](../adr/0001-defer-permissions-no-role-on-users.md) and
[ADR-0002](../adr/0002-user-profile-backfill-in-app-code.md) — read both before
starting.

## Goal

Extend the `User` model with profile fields required for `@mentions` (#3),
the user view page (#59), and (later) optional auth. Pure additive work on the
`users` table and route handlers; no auth flow, no permission enforcement, no
new user-view UI in this issue.

## Decisions already made

These are not open for re-litigation in this issue. If you find yourself wanting
to deviate, stop and surface it to the maintainer.

| Decision | Choice |
|---|---|
| Field name for the bio-line / job description | `title` (not `role`; `role` is reserved for a future permissions field) |
| `role_global` placeholder column | **Not added.** Permissions deferred entirely to issue #60. See ADR-0001. |
| Handle mutability | Mutable; uniqueness re-validated on PATCH |
| Handle regex | `^[a-z0-9_-]{1,32}$`, lowercased before storage |
| Handle case-insensitive uniqueness | Enforced via `CREATE UNIQUE INDEX … ON users(lower(handle))` |
| Reserved handle names | `me, admin, system, api, app, root, support, help, agentic-kanban, agent, user, users, openclaw` |
| `title` shape | `TEXT NOT NULL DEFAULT ''`, max 80 chars (UTF-16 code units), rendered as-is (no markdown) |
| `bio` shape | `TEXT NOT NULL DEFAULT ''`, max 280 chars (UTF-16 code units), rendered as-is (no markdown) |
| `avatar` storage | Single TEXT column; if starts with `http://` or `https://` treat as URL, else emoji |
| `avatar` validation | URLs: scheme must be `http` or `https`, max 2048 chars. Emoji: 1–8 chars long, must contain at least one non-ASCII codepoint |
| `avatar` default pick | Deterministic by user id: `EMOJI_LIST[hashCode(id) % EMOJI_LIST.length]` |
| `token_hash` shape | `TEXT NULL`, max 512 chars. Write-only at the API layer (accepted on POST/PATCH, never returned in any response, never used by server logic) |
| `kind` mutability | Editable via PATCH (per maintainer choice; not immutable) |
| PATCH editable fields | `display_name`, `handle`, `title`, `bio`, `avatar`, `token_hash`, `kind` |
| PATCH non-editable fields | `id`, `created_at` |
| Backfill placement | TypeScript function in `backend/src/services/users.ts`, called from server startup. See ADR-0002. |
| Frontend scope | Render avatar in `UserPicker` only. Do not touch FilterBar, TaskCard, TaskDrawer in this issue. |

## Out of scope

- Login / sessions / auth middleware (token_hash is stored, never read)
- Permission enforcement and the `role` permissions column (issue #60)
- User-view page UI (issue #59)
- `@mentions` parsing or rendering (issue #3)
- Updating FilterBar / TaskCard / TaskDrawer to render avatars
- Emitting SSE events on user mutations (the stream is task-only today; leave it that way)

---

## Step 1 — Shared types and constants

File: [`shared/src/index.ts`](../../shared/src/index.ts)

### 1.1 Extend the `User` interface

Replace the existing `User` interface with:

```ts
export interface User {
  id: string;
  display_name: string;
  handle: string;
  kind: UserKind;
  title: string;
  bio: string;
  avatar: string;
  created_at: string;
}
```

Note: `token_hash` is intentionally **not** on the `User` interface. It is
never returned from the API, so the shared shape does not include it.

### 1.2 Update / add request types

```ts
export interface CreateUserRequest {
  id: string;
  display_name: string;
  kind: UserKind;
  handle?: string;       // optional; defaults to slugify(display_name) with dedup
  title?: string;        // defaults to ""
  bio?: string;          // defaults to ""
  avatar?: string;       // defaults to deterministic emoji
  token_hash?: string | null;  // defaults to null; write-only
}

export interface UpdateUserRequest {
  display_name?: string;
  handle?: string;
  kind?: UserKind;
  title?: string;
  bio?: string;
  avatar?: string;
  token_hash?: string | null;  // explicit null clears
}
```

### 1.3 Add the curated emoji list

Add this exported constant. The list is intentionally 30 visually distinct
emoji with no skin-tone variants or flags.

```ts
export const AVATAR_EMOJI_LIST = [
  "🦊", "🦁", "🐯", "🐼", "🐨",
  "🐮", "🐸", "🐵", "🐧", "🦉",
  "🦄", "🐙", "🦋", "🌸", "🌻",
  "🌈", "⭐", "🔥", "⚡", "🚀",
  "🎨", "🎯", "🧠", "💡", "☕",
  "🌊", "🍀", "🍄", "🎵", "🧩",
] as const;
```

### 1.4 Add the reserved handles list

```ts
export const RESERVED_HANDLES: readonly string[] = [
  "me", "admin", "system", "api", "app", "root",
  "support", "help", "agentic-kanban", "agent",
  "user", "users", "openclaw",
] as const;
```

### 1.5 Add the handle regex constant

```ts
export const HANDLE_REGEX = /^[a-z0-9_-]{1,32}$/;
```

---

## Step 2 — Database schema

File: [`backend/src/db/schema.ts`](../../backend/src/db/schema.ts)

Update the `users` table definition. Note the unique-index handling is done in
the migration SQL (Drizzle's `.unique()` on a column generates a plain `UNIQUE`
constraint, but we want `UNIQUE(lower(handle))` which is a functional index —
written by hand in the migration file).

```ts
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  handle: text("handle").notNull(),  // NOT NULL; uniqueness enforced by functional index
  kind: text("kind", { enum: ["human", "agent"] }).notNull(),
  title: text("title").notNull().default(""),
  bio: text("bio").notNull().default(""),
  avatar: text("avatar").notNull(),
  tokenHash: text("token_hash"),
  createdAt: text("created_at").notNull(),
});
```

**Important:** the Drizzle schema declares `handle` and `avatar` as `notNull()`
even though the migration adds them as nullable initially (to permit backfill).
This is intentional — by the time the application is serving requests, the
backfill has run and the not-null guarantee holds. The schema describes the
post-backfill invariant.

---

## Step 3 — Generate migration

Run from `backend/`:

```bash
npm run db:generate
```

This produces `backend/migrations/0005_<auto_name>.sql`. **Do not commit it
as-is.** Drizzle-kit will generate `ALTER TABLE … ADD COLUMN handle TEXT NOT NULL`,
which fails on a non-empty database because existing rows have no value.

### 3.1 Hand-edit the generated migration

Replace the file's contents with the following (rename the file if its
auto-generated slug is unhelpful, e.g.
`0005_user_profile.sql`):

```sql
ALTER TABLE `users` ADD COLUMN `handle` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `title` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `bio` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `avatar` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `token_hash` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_handle_lower_unique` ON `users` (lower(`handle`));
```

Rationale:
- `handle` and `avatar` start nullable so existing rows can be inserted-into-place via backfill.
- `title` and `bio` get a default empty string — safe for existing rows.
- The unique index is on `lower(handle)`, enforcing case-insensitive uniqueness even though application code stores lowercased values. Belt-and-suspenders.
- `token_hash` stays nullable forever.

### 3.2 Snapshot file

After hand-editing, regenerate the meta snapshot. The cleanest path:

```bash
rm backend/migrations/meta/_journal.json  # only if you also need to redo it; see existing _journal.json format
```

Actually — *don't* delete the journal. Instead: after hand-editing
`0005_user_profile.sql`, run `npm run db:generate` again. Drizzle-kit detects
the SQL is in sync with the schema and only updates `meta/0005_snapshot.json`
and `meta/_journal.json`. Verify both are present and committed.

If drizzle-kit produces a diff that re-suggests `NOT NULL` for `handle` and
`avatar`, that's because the schema declares those as `notNull()`. That diff
is *acceptable to leave applied as the snapshot* — the snapshot is the
post-migration *target*, not the migration steps. The actual migration steps
are in the `.sql` file, which you already wrote correctly.

---

## Step 4 — Helpers and backfill service

New file: `backend/src/services/users.ts`

```ts
import { eq } from "drizzle-orm";
import { AVATAR_EMOJI_LIST, HANDLE_REGEX, RESERVED_HANDLES } from "@agentic-kanban/shared";
import { users } from "../db/schema.js";
import type { DBHandle } from "../db/index.js";

const RESERVED_SET = new Set(RESERVED_HANDLES.map((h) => h.toLowerCase()));

/**
 * Lowercase, collapse whitespace to `-`, strip any character not in
 * `[a-z0-9_-]`, collapse repeated `-`, trim leading/trailing `-`,
 * truncate to 32 chars.
 *
 * Returns "" if nothing survives.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/**
 * Deterministic 32-bit hash. Same string → same number. Used to pick a stable
 * avatar from the curated list given a user id.
 */
export function hashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pickAvatar(userId: string): string {
  return AVATAR_EMOJI_LIST[hashCode(userId) % AVATAR_EMOJI_LIST.length];
}

/**
 * Validate and normalize a handle. Returns the lowercased handle or throws.
 *
 * Thrown errors have `.code` set to one of:
 *   - "invalid_format" — fails regex
 *   - "reserved" — matches RESERVED_HANDLES
 */
export class HandleError extends Error {
  constructor(message: string, public code: "invalid_format" | "reserved") {
    super(message);
  }
}

export function normalizeHandle(input: string): string {
  const lower = input.toLowerCase();
  if (!HANDLE_REGEX.test(lower)) {
    throw new HandleError(
      `Handle must match ${HANDLE_REGEX.source} (1-32 chars, lowercase letters, digits, _, -)`,
      "invalid_format",
    );
  }
  if (RESERVED_SET.has(lower)) {
    throw new HandleError(`Handle "${lower}" is reserved`, "reserved");
  }
  return lower;
}

/**
 * Given a candidate handle and a "is this taken?" predicate, append numeric
 * suffixes until the candidate is unique. Truncates to keep within 32 chars.
 *
 * If the candidate itself is empty or reserved, falls back to "user".
 */
export function resolveHandleCollision(
  candidate: string,
  isTaken: (h: string) => boolean,
): string {
  const base = candidate && !RESERVED_SET.has(candidate) ? candidate : "user";
  if (!isTaken(base)) return base;
  let n = 2;
  while (true) {
    const suffix = `-${n}`;
    const truncBase = base.slice(0, Math.max(1, 32 - suffix.length));
    const candidate = `${truncBase}${suffix}`;
    if (!isTaken(candidate) && !RESERVED_SET.has(candidate)) return candidate;
    n++;
    if (n > 9999) throw new Error("Handle collision resolution exceeded 9999 attempts");
  }
}

/**
 * Validate an avatar value. Returns the value (unchanged) or throws.
 */
export class AvatarError extends Error {}

export function validateAvatar(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    if (input.length > 2048) throw new AvatarError("Avatar URL too long (max 2048 chars)");
    return input;
  }
  if (input.length < 1 || input.length > 8) {
    throw new AvatarError("Avatar emoji must be 1-8 chars");
  }
  // Reject plain ASCII (e.g. "abc") to avoid accidental text avatars.
  let hasNonAscii = false;
  for (const ch of input) {
    if (ch.codePointAt(0)! > 127) { hasNonAscii = true; break; }
  }
  if (!hasNonAscii) throw new AvatarError("Avatar must be an emoji or http(s) URL");
  return input;
}

/**
 * Backfill handle and avatar for any users where they are NULL.
 * Idempotent: only updates rows that need it.
 *
 * Called once at startup, after migrations and after seed/reset.
 */
export function backfillUserProfiles(handle: DBHandle): void {
  const rows = handle.db.select().from(users).all();
  const takenLower = new Set<string>();
  for (const r of rows) {
    if (r.handle) takenLower.add(r.handle.toLowerCase());
  }

  for (const r of rows) {
    const updates: Partial<typeof users.$inferInsert> = {};
    if (!r.handle) {
      const slug = slugify(r.displayName);
      const candidate = slug || slugify(r.id) || `user-${r.id.slice(0, 8).toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;
      const resolved = resolveHandleCollision(candidate, (h) => takenLower.has(h));
      updates.handle = resolved;
      takenLower.add(resolved);
    }
    if (!r.avatar) {
      updates.avatar = pickAvatar(r.id);
    }
    if (Object.keys(updates).length > 0) {
      handle.db.update(users).set(updates).where(eq(users.id, r.id)).run();
    }
  }
}
```

---

## Step 5 — Routes

File: [`backend/src/routes/users.ts`](../../backend/src/routes/users.ts)

### 5.1 Update `toUser`

```ts
function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    display_name: row.displayName,
    handle: row.handle,
    kind: row.kind,
    title: row.title,
    bio: row.bio,
    avatar: row.avatar,
    created_at: row.createdAt,
  };
}
```

Note: `token_hash` is deliberately excluded.

### 5.2 Update `POST /api/users`

Update the JSON Schema body to include the new optional fields:

```ts
body: {
  type: "object",
  required: ["id", "display_name", "kind"],
  properties: {
    id: { type: "string", minLength: 1, maxLength: 64 },
    display_name: { type: "string", minLength: 1, maxLength: 128 },
    kind: { type: "string", enum: ["human", "agent"] },
    handle: { type: "string", minLength: 1, maxLength: 32 },
    title: { type: "string", maxLength: 80 },
    bio: { type: "string", maxLength: 280 },
    avatar: { type: "string", minLength: 1, maxLength: 2048 },
    token_hash: { type: ["string", "null"], maxLength: 512 },
  },
},
```

Handler logic:
1. Check id collision → 409 if existing.
2. If `body.handle` provided: call `normalizeHandle(body.handle)`, then check if it's taken (`SELECT … WHERE lower(handle) = ?`) → 409 if so.
3. If `body.handle` not provided: derive via `slugify(body.display_name)` and run through `resolveHandleCollision` against the current taken set.
4. If `body.avatar` provided: call `validateAvatar(body.avatar)`.
5. If `body.avatar` not provided: `pickAvatar(body.id)`.
6. `title` defaults to `""`, `bio` defaults to `""`, `token_hash` defaults to `null`.
7. Insert with the resolved values.
8. Map `HandleError` / `AvatarError` to 400 with the error's message.
9. Return 201 + `toUser(row)` (response excludes `token_hash`).

### 5.3 Add `PATCH /api/users/:id`

New endpoint. Schema:

```ts
app.patch(
  "/api/users/:id",
  {
    schema: {
      summary: "Update a user",
      description: "Update mutable user profile fields. `id` and `created_at` cannot be changed.",
      tags: ["users"],
      params: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      body: {
        type: "object",
        properties: {
          display_name: { type: "string", minLength: 1, maxLength: 128 },
          handle: { type: "string", minLength: 1, maxLength: 32 },
          kind: { type: "string", enum: ["human", "agent"] },
          title: { type: "string", maxLength: 80 },
          bio: { type: "string", maxLength: 280 },
          avatar: { type: "string", minLength: 1, maxLength: 2048 },
          token_hash: { type: ["string", "null"], maxLength: 512 },
        },
        additionalProperties: false,
      },
    },
  },
  async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as UpdateUserRequest;

    const existing = app.db.select().from(users).where(eq(users.id, id)).get();
    if (!existing) return reply.code(404).send({ error: "User not found" });

    const updates: Partial<typeof users.$inferInsert> = {};

    if (body.display_name !== undefined) updates.displayName = body.display_name;
    if (body.kind !== undefined) updates.kind = body.kind;
    if (body.title !== undefined) updates.title = body.title;
    if (body.bio !== undefined) updates.bio = body.bio;
    if (body.token_hash !== undefined) updates.tokenHash = body.token_hash;

    if (body.handle !== undefined) {
      try {
        const normalized = normalizeHandle(body.handle);
        if (normalized !== existing.handle.toLowerCase()) {
          // Check for collision against everyone else
          const collision = app.db
            .select()
            .from(users)
            .where(and(ne(users.id, id), eq(sql`lower(${users.handle})`, normalized)))
            .get();
          if (collision) return reply.code(409).send({ error: `Handle "${normalized}" is already taken` });
        }
        updates.handle = normalized;
      } catch (e) {
        if (e instanceof HandleError) return reply.code(400).send({ error: e.message });
        throw e;
      }
    }

    if (body.avatar !== undefined) {
      try {
        updates.avatar = validateAvatar(body.avatar);
      } catch (e) {
        if (e instanceof AvatarError) return reply.code(400).send({ error: e.message });
        throw e;
      }
    }

    if (Object.keys(updates).length === 0) return toUser(existing);

    app.db.update(users).set(updates).where(eq(users.id, id)).run();
    const updated = app.db.select().from(users).where(eq(users.id, id)).get()!;
    return toUser(updated);
  },
);
```

Imports needed at the top of the file:
```ts
import { and, eq, ne, sql } from "drizzle-orm";
import type { CreateUserRequest, UpdateUserRequest, User } from "@agentic-kanban/shared";
import { HandleError, AvatarError, normalizeHandle, validateAvatar, pickAvatar, slugify, resolveHandleCollision } from "../services/users.js";
```

### 5.4 Add the new route to the OpenAPI tags / docs

No changes required — the `tags: ["users"]` on the new operation is enough.

---

## Step 6 — Server wiring

File: [`backend/src/server.ts`](../../backend/src/server.ts)

### 6.1 Update `seedUsers`

The existing `seedUsers` function inserts `id`, `displayName: seed.id`, `kind`,
`createdAt`. After this change, the INSERT must also set `handle` and
`avatar` (both NOT NULL in the Drizzle schema):

```ts
function seedUsers(
  handle: DBHandle,
  seeds: Array<{ id: string; kind: "human" | "agent" }>,
): void {
  if (!seeds.length) return;
  // Read existing handles once to avoid collisions across the seed list.
  const existingRows = handle.db.select().from(users).all();
  const takenLower = new Set(existingRows.map((r) => r.handle?.toLowerCase()).filter((x): x is string => !!x));

  for (const seed of seeds) {
    const existing = handle.db.select().from(users).where(eq(users.id, seed.id)).get();
    if (existing) continue;
    const candidate = slugify(seed.id) || `user-${seed.id.slice(0, 8).toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;
    const resolved = resolveHandleCollision(candidate, (h) => takenLower.has(h));
    takenLower.add(resolved);
    handle.db
      .insert(users)
      .values({
        id: seed.id,
        displayName: seed.id,
        handle: resolved,
        kind: seed.kind,
        title: "",
        bio: "",
        avatar: pickAvatar(seed.id),
        tokenHash: null,
        createdAt: nowIso(),
      })
      .run();
  }
}
```

Add imports at the top of `server.ts`:
```ts
import { pickAvatar, slugify, resolveHandleCollision, backfillUserProfiles } from "./services/users.js";
```

### 6.2 Call `backfillUserProfiles` after migrations and after seed/reset

In `buildApp`, after both branches of the demo / seed logic, call the backfill
unconditionally:

```ts
if (config.demo) {
  const resetter = new DemoResetter(config.demoResetMinutes * 60 * 1000);
  resetter.reset(dbHandle);
  // … existing preHandler …
} else {
  seedUsers(dbHandle, config.seedUsers);
}

backfillUserProfiles(dbHandle);  // ← new, runs in both modes
```

The backfill is idempotent — if `seedUsers` already populated everything, it's
a no-op. Its job is to fix users that existed before this migration ran.

### 6.3 Also call backfill on demo reset

`DemoResetter.reset()` recreates demo data. After reset, ensure any newly-created
users have populated handle/avatar. Two options:
1. Ensure `DemoResetter.reset()` itself populates the new fields (cleaner).
2. Call `backfillUserProfiles(dbHandle)` inside the `preHandler` after a reset.

Pick option 1 if `DemoResetter` directly inserts users. Read
`backend/src/demo.ts` to confirm — if it uses raw inserts on the `users` table,
update those inserts to include `handle`/`avatar`/`title`/`bio` like
`seedUsers`. If it goes through any higher-level helper, route that helper
through the same defaults logic.

---

## Step 7 — Frontend: avatar in UserPicker

File: [`frontend/src/components/UserPicker.tsx`](../../frontend/src/components/UserPicker.tsx)

Two surfaces to update:
1. The current-user button (the trigger that opens the picker).
2. Each row in the dropdown list.

For both, render `{u.avatar}` followed by `{u.display_name}`. Since the avatar
might be an emoji or an HTTP URL, render conditionally:

```tsx
function AvatarGlyph({ avatar }: { avatar: string }) {
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    return <img src={avatar} alt="" className="h-5 w-5 rounded-full inline-block mr-2 align-middle" />;
  }
  return <span className="mr-2 align-middle" aria-hidden>{avatar}</span>;
}
```

Find every place in `UserPicker.tsx` where `u.display_name` is rendered and
prepend `<AvatarGlyph avatar={u.display_name ? u.avatar : ""} />`.

The new-user form in `UserPicker` (the create flow) — leave the input fields
unchanged. The server auto-picks an avatar from the user id; users can later
PATCH to customize. Adding avatar selection UI is out of scope for this issue.

**Do not** modify `FilterBar.tsx`, `TaskDrawer.tsx`, or `TaskCard.tsx` in this
issue. Those are user-view-page-adjacent and belong with #59.

---

## Step 8 — Tests

File: [`backend/tests/users.test.ts`](../../backend/tests/users.test.ts) — extend the existing test file.

Add tests covering:

### 8.1 Backfill (unit, no HTTP)
- A user with `display_name = "Jane Wong"` and no handle/avatar → `backfillUserProfiles` sets handle to `jane-wong` and avatar to the deterministic emoji.
- Two users with identical display names → the second gets handle `jane-wong-2`.
- A user with display_name made entirely of non-Latin chars (e.g. `"🦄"`) → handle falls back to `user-<id8>` form.
- A user with display_name `"Admin"` → handle is `admin-2` (reserved word forces suffix) or similar; assert it's not exactly `admin`.
- Calling backfill twice in a row is a no-op (no spurious UPDATEs, no changed handles).

### 8.2 POST /api/users
- Creating with no `handle` derives one from `display_name`.
- Creating with no `avatar` picks deterministic emoji from the id.
- Creating with explicit valid `handle` lowercases it (`"Jane"` → stored as `"jane"`).
- Creating with `handle = "admin"` → 400 (reserved).
- Creating with `handle = "has spaces"` → 400 (invalid format).
- Creating with a handle that's already taken (case-insensitive: try `"JANE"` when `"jane"` exists) → 409.
- Creating with `avatar = "javascript:alert(1)"` → 400 (must be http(s) or emoji).
- Creating with `avatar = "abc"` → 400 (plain ASCII not allowed).
- Creating with `avatar = "🦊"` → 201, stored as `"🦊"`.
- Creating with `avatar = "https://example.com/a.png"` → 201.
- `token_hash` is accepted in body and *not* present in the response JSON.
- Response JSON includes `handle`, `title`, `bio`, `avatar`.

### 8.3 PATCH /api/users/:id
- PATCH `display_name` works; other fields untouched.
- PATCH `handle` to a valid new value works; lowercased.
- PATCH `handle` to a reserved word → 400.
- PATCH `handle` to another user's handle → 409.
- PATCH `handle` to its own current handle (no-op) → 200 with no error.
- PATCH attempting to change `id` → either ignored (because `additionalProperties: false` rejects it) or 400. Confirm via test that `id` cannot change.
- PATCH `kind` from `human` to `agent` succeeds (per maintainer decision).
- PATCH `avatar` validation runs (URL scheme check, emoji length check).
- PATCH `token_hash: null` clears it.
- PATCH on nonexistent id → 404.
- Response excludes `token_hash`.

### 8.4 GET /api/users and /api/users/:id
- Both responses include the new fields and omit `token_hash`.

### 8.5 Migration / seed
File: `backend/tests/migrations.test.ts` likely already covers booting an
in-memory DB through migrations. Add one assertion that, after migrations +
backfill, every user has a non-empty `handle` and non-empty `avatar`. If the
test seeds with `KANBAN_SEED_USERS`, assert the seeded user's handle is the
slugified id.

### Test helpers
Existing helpers in `backend/tests/helpers.ts` likely have a `createUser`
helper. If it constructs the body manually, leave it — the new fields are
optional. If new tests need a user with a specific `handle`, pass it explicitly.

---

## Step 9 — OpenAPI / documentation

- The schema additions in `POST` and `PATCH` automatically appear in the Scalar
  reference at `/api/docs`. No extra work.
- In [CLAUDE.md](../../CLAUDE.md), update the "Users" route list to add
  `PATCH /api/users/:id` and a one-line description.
- Update the "Gotchas for agents" section if relevant (e.g. add: "handle is
  lowercased + must match `^[a-z0-9_-]{1,32}$`; some words are reserved.").
- Do not write a new top-level README section for this; the existing CLAUDE.md
  notes are sufficient.

---

## Step 10 — Verification

Run from the repo root:

```bash
npm install                          # in case anything new is needed (it shouldn't be)
npm run build                        # builds shared, frontend, backend
npm test                             # backend vitest suite
cd backend && npm run typecheck && cd ..
cd frontend && npm run typecheck && cd ..
```

Then exercise it manually:

```bash
rm -rf backend/data && mkdir -p backend/data    # fresh DB
KANBAN_SEED_USERS=alice:human,agent-coder:agent npm run dev
# In another shell:
curl -s localhost:3000/api/users | jq .
# Expect: alice and agent-coder, each with handle="alice"/"agent-coder", avatar emoji set, title="", bio="".
```

Also test the upgrade path:

```bash
# Boot once on the *previous* schema (pre-this-PR) to generate a DB with old user rows.
# Then check out this branch and boot again — assert backfill populated handle/avatar
# without losing data.
```

(Optional but recommended: a one-off integration test that:
1. Creates a DB at a temp path with the old schema by running migrations up to 0004.
2. Inserts a user with `INSERT INTO users (id, display_name, kind, created_at) VALUES (…)`.
3. Runs the new migration + backfill.
4. Asserts the user now has a handle and avatar.)

---

## Definition of done

- [ ] All decisions in the table above are reflected in the code.
- [ ] `npm run build` succeeds in both backend and frontend.
- [ ] `npm test` passes.
- [ ] Both typechecks pass.
- [ ] `GET /api/users` returns the new fields; `token_hash` is never visible in any response.
- [ ] `POST /api/users` accepts the new optional fields, derives defaults when omitted, and rejects invalid handles/avatars with 400.
- [ ] `PATCH /api/users/:id` exists and respects the editable/non-editable field split.
- [ ] Existing users in a pre-migration DB receive populated `handle` and `avatar` after first boot.
- [ ] `UserPicker` renders the avatar in both the trigger button and the dropdown rows.
- [ ] No FilterBar / TaskCard / TaskDrawer changes.
- [ ] No auth middleware, no permissions enforcement, no `role`/`role_global` column.
- [ ] CLAUDE.md updated with the new PATCH endpoint and handle gotcha.
