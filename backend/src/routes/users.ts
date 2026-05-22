import type { FastifyPluginAsync } from "fastify";
import { and, eq, ne, sql } from "drizzle-orm";
import type { CreateUserRequest, Role, UpdateUserRequest, User } from "@agentic-kanban/shared";
import { users } from "../db/schema.js";
import { nowIso } from "../services/tasks.js";
import {
  HandleError,
  AvatarError,
  normalizeHandle,
  validateAvatar,
  pickAvatar,
  slugify,
  resolveHandleCollision,
  DEFAULT_ADMINISTRATOR_ID,
} from "../services/users.js";
import { canDeleteUser, canEditUser, canManageUsers } from "../auth/policy.js";
import { deleteSessionsForUser } from "../services/sessions.js";

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    display_name: row.displayName,
    handle: row.handle ?? "",
    kind: row.kind,
    role: row.role as Role,
    title: row.title,
    bio: row.bio,
    avatar: row.avatar ?? "",
    created_at: row.createdAt,
    deleted_at: row.deletedAt,
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
            role: { type: "string", enum: ["Admin", "Member"] },
            handle: { type: "string", minLength: 1, maxLength: 32 },
            title: { type: "string", maxLength: 80 },
            bio: { type: "string", maxLength: 280 },
            avatar: { type: "string", minLength: 1, maxLength: 2048 },
          },
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      if (!canManageUsers(actor)) return reply.code(403).send({ error: "Forbidden" });

      const body = req.body as CreateUserRequest;
      if (body.role !== undefined && !canManageUsers(actor)) {
        return reply.code(400).send({ error: "Only Admins may set role" });
      }

      const existing = app.db.select().from(users).where(eq(users.id, body.id)).get();
      if (existing) return reply.code(409).send({ error: "User already exists" });

      let handle: string;
      try {
        if (body.handle !== undefined) {
          const normalized = normalizeHandle(body.handle);
          const collision = app.db
            .select()
            .from(users)
            .where(eq(sql`lower(${users.handle})`, normalized))
            .get();
          if (collision) return reply.code(409).send({ error: `Handle "${normalized}" is already taken` });
          handle = normalized;
        } else {
          const slug = slugify(body.display_name);
          const takenLower = new Set(
            app.db.select({ h: users.handle }).from(users).all()
              .map((r) => r.h?.toLowerCase())
              .filter((h): h is string => !!h),
          );
          handle = resolveHandleCollision(slug, (h) => takenLower.has(h));
        }
      } catch (e) {
        if (e instanceof HandleError) return reply.code(400).send({ error: e.message });
        throw e;
      }

      let avatar: string;
      try {
        avatar = body.avatar !== undefined ? validateAvatar(body.avatar) : pickAvatar(body.id);
      } catch (e) {
        if (e instanceof AvatarError) return reply.code(400).send({ error: e.message });
        throw e;
      }

      const row = {
        id: body.id,
        displayName: body.display_name,
        handle,
        kind: body.kind,
        role: (body.role ?? "Member") as "Admin" | "Member",
        title: body.title ?? "",
        bio: body.bio ?? "",
        avatar,
        passwordHash: null,
        createdAt: nowIso(),
        deletedAt: null,
      };
      app.db.insert(users).values(row).run();
      reply.code(201);
      return toUser(row);
    },
  );

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
            role: { type: "string", enum: ["Admin", "Member"] },
            title: { type: "string", maxLength: 80 },
            bio: { type: "string", maxLength: 280 },
            avatar: { type: "string", minLength: 1, maxLength: 2048 },
            password_hash: { type: "null", description: "Admin-only: set to null to clear the user's password (forces passwordless-once on next login)." },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const actor = req.actor!;
      const body = req.body as UpdateUserRequest;

      // Default Administrator invariant guards (before authorization)
      if (id === DEFAULT_ADMINISTRATOR_ID) {
        if (body.role !== undefined || body.handle !== undefined) {
          return reply.code(400).send({ error: "Cannot change role or handle of the Default Administrator" });
        }
      }

      if (!canEditUser(actor, id)) return reply.code(403).send({ error: "Forbidden" });

      // Non-Admins cannot set role
      if (body.role !== undefined && !canManageUsers(actor)) {
        return reply.code(400).send({ error: "Only Admins may change role" });
      }

      const existing = app.db.select().from(users).where(eq(users.id, id)).get();
      if (!existing) return reply.code(404).send({ error: "User not found" });
      if (existing.deletedAt) return reply.code(404).send({ error: "User not found" });

      const updates: Partial<typeof users.$inferInsert> = {};

      if (body.display_name !== undefined) updates.displayName = body.display_name;
      if (body.kind !== undefined) updates.kind = body.kind;
      if (body.role !== undefined) updates.role = body.role;
      if (body.title !== undefined) updates.title = body.title;
      if (body.bio !== undefined) updates.bio = body.bio;

      let clearPassword = false;
      if (body.password_hash !== undefined) {
        if (body.password_hash !== null) {
          return reply.code(400).send({ error: "password_hash may only be set to null" });
        }
        if (!canManageUsers(actor)) {
          return reply.code(403).send({ error: "Only Admins may reset passwords" });
        }
        if (id === actor.id) {
          return reply.code(400).send({ error: "Use /api/auth/change-password to change your own password" });
        }
        updates.passwordHash = null;
        clearPassword = true;
      }

      if (body.handle !== undefined) {
        try {
          const normalized = normalizeHandle(body.handle);
          if (normalized !== (existing.handle ?? "").toLowerCase()) {
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
      if (clearPassword) {
        deleteSessionsForUser(app.db, id);
      }
      const updated = app.db.select().from(users).where(eq(users.id, id)).get()!;
      return toUser(updated);
    },
  );

  app.delete(
    "/api/users/:id",
    {
      schema: {
        summary: "Soft-delete a user",
        description:
          "Marks the user as deleted by setting `deleted_at` and clearing `token_hash`. The row is retained so historical attribution on tasks and events stays intact. Idempotent: deleting an already-deleted user returns 204. The handle remains reserved (see ADR-0004).",
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
      const actor = req.actor!;

      if (id === DEFAULT_ADMINISTRATOR_ID) {
        return reply.code(400).send({ error: "Cannot delete the Default Administrator" });
      }

      if (!canDeleteUser(actor, id)) return reply.code(403).send({ error: "Forbidden" });

      const row = app.db.select().from(users).where(eq(users.id, id)).get();
      if (!row) return reply.code(404).send({ error: "User not found" });
      if (!row.deletedAt) {
        app.db
          .update(users)
          .set({ deletedAt: nowIso(), passwordHash: null })
          .where(eq(users.id, id))
          .run();
        deleteSessionsForUser(app.db, id);
      }
      reply.code(204);
    },
  );
};
