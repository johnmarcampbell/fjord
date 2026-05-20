import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import type { CreateGrantRequest, CreateSpaceRequest, Grant, UpdateSpaceRequest } from "@agentic-kanban/shared";
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

function toGrant(row: typeof userSpaceAccess.$inferSelect): Grant {
  return {
    user_id: row.userId,
    space_id: row.spaceId,
    granted_at: row.grantedAt,
    granted_by: row.grantedBy,
  };
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
      const all = listSpaces(app.db, { includeArchived });
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
      try {
        const space = getSpace(app.db, (req.params as { id: string }).id);
        if (!canAccessSpace(actor, space.id)) return reply.code(403).send({ error: "Forbidden" });
        return space;
      } catch (err) {
        if (err instanceof SpaceNotFoundError)
          return reply.code(404).send({ error: "Space not found" });
        throw err;
      }
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
      const created = createSpace(app.db, req.body as CreateSpaceRequest, actor.id);
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
      try {
        const space = getSpace(app.db, (req.params as { id: string }).id);
        if (!canManageSpace(actor, space)) return reply.code(403).send({ error: "Forbidden" });
        return updateSpace(app.db, space.id, req.body as UpdateSpaceRequest);
      } catch (err) {
        if (err instanceof SpaceNotFoundError)
          return reply.code(404).send({ error: "Space not found" });
        throw err;
      }
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
      try {
        const space = getSpace(app.db, spaceId);
        if (!canManageSpace(actor, space)) return reply.code(403).send({ error: "Forbidden" });
        deleteSpace(app.db, spaceId);
        reply.code(204);
      } catch (err) {
        if (err instanceof CannotDeleteDefaultSpaceError)
          return reply.code(400).send({ error: "Cannot delete the default space" });
        if (err instanceof SpaceNotEmptyError)
          return reply
            .code(400)
            .send({ error: "Space still has tasks; move or delete them first" });
        if (err instanceof SpaceNotFoundError)
          return reply.code(404).send({ error: "Space not found" });
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
      try {
        const space = getSpace(app.db, (req.params as { id: string }).id);
        if (!canManageSpace(actor, space)) return reply.code(403).send({ error: "Forbidden" });
        return archiveSpace(app.db, space.id);
      } catch (err) {
        if (err instanceof SpaceArchiveBlockedError)
          return reply
            .code(400)
            .send({ error: "Space has unarchived tasks; archive them first" });
        if (err instanceof SpaceNotFoundError)
          return reply.code(404).send({ error: "Space not found" });
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
      try {
        const space = getSpace(app.db, (req.params as { id: string }).id);
        if (!canManageSpace(actor, space)) return reply.code(403).send({ error: "Forbidden" });
        return unarchiveSpace(app.db, space.id);
      } catch (err) {
        if (err instanceof SpaceNotFoundError)
          return reply.code(404).send({ error: "Space not found" });
        throw err;
      }
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
      try {
        getSpace(app.db, spaceId);
      } catch {
        return reply.code(404).send({ error: "Space not found" });
      }
      if (!canAccessSpace(actor, spaceId)) return reply.code(403).send({ error: "Forbidden" });
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

      let space;
      try {
        space = getSpace(app.db, spaceId);
      } catch {
        return reply.code(404).send({ error: "Space not found" });
      }
      if (!canGrantAccessForSpace(actor, space)) return reply.code(403).send({ error: "Forbidden" });

      const targetUser = app.db.select().from(users).where(eq(users.id, targetUserId)).get();
      if (!targetUser) return reply.code(400).send({ error: "User not found" });
      if (targetUser.deletedAt) return reply.code(400).send({ error: "Cannot grant access to deleted user" });
      if (targetUser.role === "Admin") return reply.code(400).send({ error: "Admin already has access to all spaces" });

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

      let space;
      try {
        space = getSpace(app.db, spaceId);
      } catch {
        return reply.code(404).send({ error: "Space not found" });
      }
      if (!canGrantAccessForSpace(actor, space)) return reply.code(403).send({ error: "Forbidden" });

      if (space.created_by === targetUserId) {
        return reply.code(400).send({ error: "Cannot revoke access from the space owner" });
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
