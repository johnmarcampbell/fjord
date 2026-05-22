import { eq } from "drizzle-orm";
import {
  DEFAULT_ADMINISTRATOR_ID,
  RESERVED_HANDLES,
  pickAvatar,
  slugify,
} from "@agentic-kanban/shared";
import { users } from "../db/schema.js";
import type { DBHandle } from "../db/index.js";
import { nowIso } from "./tasks.js";

const RESERVED_SET = new Set(RESERVED_HANDLES.map((h) => h.toLowerCase()));

/**
 * Appends numeric suffixes to `candidate` until unique. If the candidate is
 * empty or reserved, falls back to "user".
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
    const next = `${truncBase}${suffix}`;
    if (!isTaken(next) && !RESERVED_SET.has(next)) return next;
    n++;
    if (n > 9999) throw new Error("Handle collision resolution exceeded 9999 attempts");
  }
}

/**
 * Creates the Default Administrator user if it does not already exist.
 * Idempotent — safe to call on every startup.
 */
export function seedDefaultAdministrator(handle: DBHandle): void {
  const existing = handle.db
    .select()
    .from(users)
    .where(eq(users.id, DEFAULT_ADMINISTRATOR_ID))
    .get();
  if (existing) return;

  handle.db
    .insert(users)
    .values({
      id: DEFAULT_ADMINISTRATOR_ID,
      displayName: "Administrator",
      handle: "admin",
      kind: "human",
      role: "Admin",
      title: "Administrator",
      bio: "Built-in administrator. Cannot be deleted.",
      avatar: "🛡️",
      passwordHash: null,
      createdAt: nowIso(),
      deletedAt: null,
    })
    .run();
}

/**
 * Backfill handle and avatar for any users where they are NULL.
 * Idempotent — only updates rows that need it. Called at startup after
 * migrations and after seed/reset.
 */
export function backfillUserProfiles(handle: DBHandle): void {
  const rows = handle.db
    .select({ id: users.id, displayName: users.displayName, handle: users.handle, avatar: users.avatar })
    .from(users)
    .all();
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
