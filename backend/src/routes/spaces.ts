import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { CreateGrantRequest, CreateSpaceRequest, Grant, Space, UpdateSpaceRequest } from "@agentic-kanban/shared";
import {
  CannotDeleteDefaultSpaceError,
  SpaceArchiveBlockedError,
  SpaceNotEmptyError,
  SpaceNotFoundError,
  archiveSpace,
  createSpace,
  deleteSpace,
  getSpace,
  listSpaces,
  unarchiveSpace,
  updateSpace,
} from "../services/spaces.js";
import { canAccessSpace, canGrantAccessForSpace, canManageSpace } from "../auth/policy.js";
import { userSpaceAccess, users } from "../db/schema.js";
import { nowIso } from "../services/tasks.js";
import { badRequest, forbidden, notFound } from "./http.js";
import type { DB } from "../db/index.js";

function toGrant(row: typeof userSpaceAccess.$inferSelect): Grant {
  return {
    user_id: row.userId,
    space_id: row.spaceId,
    granted_at: row.grantedAt,
    granted_by: row.grantedBy,
  };
}

/**
 * Load a space by id, sending a 404 and returning null when it doesn't exist.
 * Optional affiliation args are forwarded to `getSpace` for the `affiliated` flag.
 */
function loadSpaceOr404(
  db: DB,
  reply: FastifyReply,
  id: string,
  affiliatedSpaceIds?: Set<string>,
  actorId?: string,
): Space | null {
  try {
    return getSpace(db, id, affiliatedSpaceIds, actorId);
  } catch (err) {
    if (err instanceof SpaceNotFoundError) {
      notFound(reply, "Space");
      return null;
    }
    throw err;
  }
}

export const spacesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/spaces",
    {
      schema: {
        summary: "List spaces (archived excluded by default)",
        tags: ["spaces"],
        querystring: {
          type: "object",
          properties: {
            include_archived: { type: "string", enum: ["true", "false"] },
          },
        },
      },
    },
    async (req) => {
      const actor = req.actor!;
      const includeArchived =
        (req.query as { include_archived?: string }).include_archived === "true";
      const all = listSpaces(app.db, { includeArchived }, actor.affiliatedSpaceIds, actor.id);
      if (actor.accessibleSpaceIds === "all") return all;
      return all.filter((s) => actor.accessibleSpaceIds !== "all" && (actor.accessibleSpaceIds as Set<string>).has(s.id));
    },
  );

  app.get(
    "/api/spaces/:id",
    {
      schema: {
        summary: "Get a space by id",
        tags: ["spaces"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const space = loadSpaceOr404(app.db, reply, (req.params as { id: string }).id, actor.affiliatedSpaceIds, actor.id);
      if (!space) return;
      if (!canAccessSpace(actor, space.id)) return forbidden(reply);
      return space;
    },
  );

  app.post(
    "/api/spaces",
    {
      schema: {
        summary: "Create a space",
        tags: ["spaces"],
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 128 },
            description: { type: "string", default: "" },
          },
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const created = createSpace(app.db, req.body as CreateSpaceRequest, actor.id, actor.affiliatedSpaceIds);
      reply.code(201);
      return created;
    },
  );

  app.patch(
    "/api/spaces/:id",
    {
      schema: {
        summary: "Update a space",
        tags: ["spaces"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 128 },
            description: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const space = loadSpaceOr404(app.db, reply, (req.params as { id: string }).id);
      if (!space) return;
      if (!canManageSpace(actor, space)) return forbidden(reply);
      return updateSpace(app.db, space.id, req.body as UpdateSpaceRequest, actor.affiliatedSpaceIds, actor.id);
    },
  );

  app.delete(
    "/api/spaces/:id",
    {
      schema: {
        summary: "Delete a space (only when it has no tasks; empty projects cascade)",
        tags: ["spaces"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const spaceId = (req.params as { id: string }).id;
      const space = loadSpaceOr404(app.db, reply, spaceId);
      if (!space) return;
      if (!canManageSpace(actor, space)) return forbidden(reply);
      try {
        deleteSpace(app.db, spaceId);
        reply.code(204);
      } catch (err) {
        if (err instanceof CannotDeleteDefaultSpaceError)
          return badRequest(reply, "Cannot delete the default space");
        if (err instanceof SpaceNotEmptyError)
          return badRequest(reply, "Space still has tasks; move or delete them first");
        throw err;
      }
    },
  );

  app.post(
    "/api/spaces/:id/archive",
    {
      schema: {
        summary: "Archive a space (only when every task in it is already archived)",
        tags: ["spaces"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const space = loadSpaceOr404(app.db, reply, (req.params as { id: string }).id);
      if (!space) return;
      if (!canManageSpace(actor, space)) return forbidden(reply);
      try {
        return archiveSpace(app.db, space.id, actor.affiliatedSpaceIds, actor.id);
      } catch (err) {
        if (err instanceof SpaceArchiveBlockedError)
          return badRequest(reply, "Space has unarchived tasks; archive them first");
        throw err;
      }
    },
  );

  app.post(
    "/api/spaces/:id/unarchive",
    {
      schema: {
        summary: "Unarchive a space",
        tags: ["spaces"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const space = loadSpaceOr404(app.db, reply, (req.params as { id: string }).id);
      if (!space) return;
      if (!canManageSpace(actor, space)) return forbidden(reply);
      return unarchiveSpace(app.db, space.id, actor.affiliatedSpaceIds, actor.id);
    },
  );

  // ── Space access grants ────────────────────────────────────────────────────

  app.get(
    "/api/spaces/:id/access",
    {
      schema: {
        summary: "List access grants for a space",
        tags: ["spaces"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const spaceId = (req.params as { id: string }).id;
      if (!loadSpaceOr404(app.db, reply, spaceId)) return;
      if (!canAccessSpace(actor, spaceId)) return forbidden(reply);
      const rows = app.db
        .select()
        .from(userSpaceAccess)
        .where(eq(userSpaceAccess.spaceId, spaceId))
        .all();
      return rows.map(toGrant);
    },
  );

  app.post(
    "/api/spaces/:id/access",
    {
      schema: {
        summary: "Grant a user access to a space",
        tags: ["spaces"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          required: ["user_id"],
          properties: {
            user_id: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const spaceId = (req.params as { id: string }).id;
      const { user_id: targetUserId } = req.body as CreateGrantRequest;

      const space = loadSpaceOr404(app.db, reply, spaceId);
      if (!space) return;
      if (!canGrantAccessForSpace(actor, space)) return forbidden(reply);

      const targetUser = app.db.select().from(users).where(eq(users.id, targetUserId)).get();
      if (!targetUser) return badRequest(reply, "User not found");
      if (targetUser.deletedAt) return badRequest(reply, "Cannot grant access to deleted user");

      app.db
        .insert(userSpaceAccess)
        .values({ userId: targetUserId, spaceId, grantedAt: nowIso(), grantedBy: actor.id })
        .onConflictDoNothing()
        .run();

      reply.code(201);
      const row = app.db
        .select()
        .from(userSpaceAccess)
        .where(
          and(
            eq(userSpaceAccess.userId, targetUserId),
            eq(userSpaceAccess.spaceId, spaceId),
          ),
        )
        .get()!;
      return toGrant(row);
    },
  );

  app.delete(
    "/api/spaces/:id/access/:user_id",
    {
      schema: {
        summary: "Revoke a user's access to a space (idempotent)",
        tags: ["spaces"],
        params: {
          type: "object",
          properties: { id: { type: "string" }, user_id: { type: "string" } },
          required: ["id", "user_id"],
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const { id: spaceId, user_id: targetUserId } = req.params as { id: string; user_id: string };

      const space = loadSpaceOr404(app.db, reply, spaceId);
      if (!space) return;
      if (!canGrantAccessForSpace(actor, space)) return forbidden(reply);

      if (space.created_by === targetUserId) {
        return badRequest(reply, "Cannot revoke access from the space owner");
      }

      app.db
        .delete(userSpaceAccess)
        .where(
          and(
            eq(userSpaceAccess.userId, targetUserId),
            eq(userSpaceAccess.spaceId, spaceId),
          ),
        )
        .run();

      reply.code(200).send({});
    },
  );
};
