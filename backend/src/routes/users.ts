import type { FastifyPluginAsync } from "fastify";
import { eq } from "drizzle-orm";
import type { CreateUserRequest, User } from "@agentic-kanban/shared";
import { users } from "../db/schema.js";
import { nowIso } from "../services/tasks.js";

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    display_name: row.displayName,
    kind: row.kind,
    created_at: row.createdAt,
  };
}

export const usersRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/users",
    {
      schema: {
        summary: "List all users",
        tags: ["users"],
      },
    },
    async () => {
      const rows = app.db.select().from(users).all();
      return rows.map(toUser);
    },
  );

  app.get(
    "/api/users/:id",
    {
      schema: {
        summary: "Get a user by id",
        tags: ["users"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const row = app.db.select().from(users).where(eq(users.id, id)).get();
      if (!row) return reply.code(404).send({ error: "User not found" });
      return toUser(row);
    },
  );

  app.post(
    "/api/users",
    {
      schema: {
        summary: "Create a user",
        tags: ["users"],
        body: {
          type: "object",
          required: ["id", "display_name", "kind"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 64 },
            display_name: { type: "string", minLength: 1, maxLength: 128 },
            kind: { type: "string", enum: ["human", "agent"] },
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as CreateUserRequest;
      const existing = app.db.select().from(users).where(eq(users.id, body.id)).get();
      if (existing) return reply.code(409).send({ error: "User already exists" });
      const row = {
        id: body.id,
        displayName: body.display_name,
        kind: body.kind,
        createdAt: nowIso(),
      };
      app.db.insert(users).values(row).run();
      reply.code(201);
      return toUser(row);
    },
  );

  app.delete(
    "/api/users/:id",
    {
      schema: {
        summary: "Delete a user",
        description:
          "Hard-delete a user. Tasks assigned to or reported by this user retain their assigned_to/reported_by values; no cascade is performed.",
        tags: ["users"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const row = app.db.select().from(users).where(eq(users.id, id)).get();
      if (!row) return reply.code(404).send({ error: "User not found" });
      app.db.delete(users).where(eq(users.id, id)).run();
      reply.code(204);
    },
  );
};
