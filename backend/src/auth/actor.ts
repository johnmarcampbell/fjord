import { eq } from "drizzle-orm";
import type { Role } from "@agentic-kanban/shared";
import type { DB } from "../db/index.js";
import { spaces, userSpaceAccess, users } from "../db/schema.js";
import { SESSION_COOKIE, bumpLastSeen, resolveSession } from "../services/sessions.js";
import { bumpLastUsed, parseBearer, verifyBearer } from "../services/api_tokens.js";

export interface Actor {
  id: string;
  role: Role;
  /** Admins get "all"; Members get the set of space IDs they can access (owned + granted). */
  accessibleSpaceIds: Set<string> | "all";
  /** How the actor authenticated. Bearer-authed callers are CSRF-exempt. */
  authMethod: "session" | "bearer";
  /** Present only when authMethod === "session". */
  sessionId?: string;
}

export interface ResolveActorInput {
  cookies: Record<string, string | undefined>;
  authorization?: string | string[];
  idleDays: number;
}

export type ResolveActorResult =
  | { actor: Actor }
  | { error: string; status: 401 };

export async function resolveActor(
  db: DB,
  input: ResolveActorInput,
): Promise<ResolveActorResult> {
  // 1) Bearer token (agents / CLI)
  const tokenValue = parseBearer(input.authorization);
  if (tokenValue) {
    const verified = await verifyBearer(db, tokenValue);
    if (!verified) {
      return { error: "Invalid or expired API token", status: 401 };
    }
    bumpLastUsed(db, verified.tokenId, verified.lastUsedAt);
    const actor = await loadActor(db, verified.userId, "bearer");
    if (!actor) return { error: "User has been deleted", status: 401 };
    return { actor };
  }

  // 2) Session cookie
  const sessionId = input.cookies[SESSION_COOKIE];
  if (sessionId) {
    const session = resolveSession(db, sessionId);
    if (!session) {
      return { error: "Session expired", status: 401 };
    }
    const actor = await loadActor(db, session.userId, "session", session.sessionId);
    if (!actor) return { error: "User has been deleted", status: 401 };
    bumpLastSeen(db, session.sessionId, input.idleDays, session.lastSeenAt);
    return { actor };
  }

  return { error: "Authentication required", status: 401 };
}

async function loadActor(
  db: DB,
  userId: string,
  authMethod: Actor["authMethod"],
  sessionId?: string,
): Promise<Actor | null> {
  const userRow = db.select().from(users).where(eq(users.id, userId)).get();
  if (!userRow) return null;
  if (userRow.deletedAt) return null;

  const role = userRow.role as Role;
  if (role === "Admin") {
    return { id: userId, role, accessibleSpaceIds: "all", authMethod, sessionId };
  }

  const ownedRows = db
    .select({ id: spaces.id })
    .from(spaces)
    .where(eq(spaces.createdBy, userId))
    .all();

  const grantedRows = db
    .select({ spaceId: userSpaceAccess.spaceId })
    .from(userSpaceAccess)
    .where(eq(userSpaceAccess.userId, userId))
    .all();

  const accessibleSpaceIds = new Set<string>([
    ...ownedRows.map((r) => r.id),
    ...grantedRows.map((r) => r.spaceId),
  ]);

  return { id: userId, role, accessibleSpaceIds, authMethod, sessionId };
}

/** True when the user is currently blocked from making write requests until they set a password. */
export function actorRequiresPasswordSet(db: DB, actor: Actor, demo: boolean): boolean {
  if (demo) return false;
  const row = db.select({ passwordHash: users.passwordHash, kind: users.kind }).from(users).where(eq(users.id, actor.id)).get();
  if (!row) return false;
  if (row.kind !== "human") return false;
  return row.passwordHash === null;
}
