import { eq } from "drizzle-orm";
import { AVATAR_EMOJI_LIST, HANDLE_REGEX, RESERVED_HANDLES } from "@agentic-kanban/shared";
import { users } from "../db/schema.js";
import type { DBHandle } from "../db/index.js";
import { nowIso } from "./tasks.js";

export const DEFAULT_ADMINISTRATOR_ID = "default-administrator";

const RESERVED_SET = new Set(RESERVED_HANDLES.map((h) => h.toLowerCase()));

/**
 * Lowercase, collapse whitespace to `-`, strip non `[a-z0-9_-]` chars,
 * collapse repeated `-`, trim leading/trailing `-`, truncate to 32 chars.
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

/** Deterministic 32-bit hash — same string → same number. */
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

export class AvatarError extends Error {}

export function validateAvatar(input: string): string {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    if (input.length > 2048) throw new AvatarError("Avatar URL too long (max 2048 chars)");
    return input;
  }
  if (input.length < 1 || input.length > 8) {
    throw new AvatarError("Avatar emoji must be 1-8 chars");
  }
  let hasNonAscii = false;
  for (const ch of input) {
    if (ch.codePointAt(0)! > 127) { hasNonAscii = true; break; }
  }
  if (!hasNonAscii) throw new AvatarError("Avatar must be an emoji or http(s) URL");
  return input;
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
