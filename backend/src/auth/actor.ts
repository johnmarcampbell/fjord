import { eq } from "drizzle-orm";
import type { Role } from "@agentic-kanban/shared";
import type { DB } from "../db/index.js";
import { spaces, userSpaceAccess, users } from "../db/schema.js";
import { pickAvatar, slugify, resolveHandleCollision } from "../services/users.js";
import { nowIso } from "../services/tasks.js";

export const ACTOR_HEADER = "x-user-id";

export interface Actor {
  id: string;
  role: Role;
  /** Admins get "all"; Members get the set of space IDs they can access (owned + granted). */
  accessibleSpaceIds: Set<string> | "all";
}

export async function resolveActor(
  db: DB,
  rawHeader: string | string[] | undefined,
  demo: boolean,
): Promise<{ actor: Actor } | { error: string; status: 400 }> {
  const actorId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!actorId) {
    return { error: `Missing required header: ${ACTOR_HEADER}`, status: 400 };
  }

  let userRow = db.select().from(users).where(eq(users.id, actorId)).get();

  if (!userRow) {
    if (demo) {
      const existingHandles = new Set(
        db.select({ h: users.handle }).from(users).all()
          .map((r) => r.h?.toLowerCase())
          .filter((h): h is string => !!h),
      );
      const candidate = slugify(actorId) || `user-${actorId.slice(0, 8).toLowerCase().replace(/[^a-z0-9_-]/g, "")}`;
      const handle = resolveHandleCollision(candidate, (h) => existingHandles.has(h));
      db.insert(users)
        .values({ id: actorId, displayName: actorId, handle, kind: "human", role: "Member", title: "", bio: "", avatar: pickAvatar(actorId), tokenHash: null, createdAt: nowIso() })
        .run();
      userRow = db.select().from(users).where(eq(users.id, actorId)).get()!;
    } else {
      return { error: `Unknown user in ${ACTOR_HEADER}: ${actorId}`, status: 400 };
    }
  }

  if (userRow.deletedAt) {
    return { error: "User has been deleted", status: 400 };
  }

  const role = userRow.role as Role;

  if (role === "Admin") {
    return { actor: { id: actorId, role, accessibleSpaceIds: "all" } };
  }

  // Member: compute accessible spaces (owned + granted)
  const ownedRows = db
    .select({ id: spaces.id })
    .from(spaces)
    .where(eq(spaces.createdBy, actorId))
    .all();

  const grantedRows = db
    .select({ spaceId: userSpaceAccess.spaceId })
    .from(userSpaceAccess)
    .where(eq(userSpaceAccess.userId, actorId))
    .all();

  const accessibleSpaceIds = new Set<string>([
    ...ownedRows.map((r) => r.id),
    ...grantedRows.map((r) => r.spaceId),
  ]);

  return { actor: { id: actorId, role, accessibleSpaceIds } };
}
