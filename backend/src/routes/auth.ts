import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { eq, sql } from "drizzle-orm";
import {
  DEFAULT_ADMINISTRATOR_ID,
  type AuthMe,
  type ChangePasswordRequest,
  type LoginRequest,
  type Role,
} from "@agentic-kanban/shared";
import { users } from "../db/schema.js";
import { hashPassword, verifyPassword } from "../services/passwords.js";
import {
  SESSION_COOKIE,
  createSession,
  deleteSession,
  deleteSessionsForUser,
} from "../services/sessions.js";

function setSessionCookie(reply: FastifyReply, sessionId: string, maxAgeSeconds: number, secure: boolean): void {
  reply.setCookie(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });
}

function toAuthMe(row: typeof users.$inferSelect, demo: boolean): AuthMe {
  return {
    id: row.id,
    display_name: row.displayName,
    handle: row.handle,
    kind: row.kind,
    role: row.role as Role,
    avatar: row.avatar,
    requires_password_set: !demo && row.kind === "human" && row.passwordHash === null,
  };
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  const secure = app.config.nodeEnv === "production";

  app.post(
    "/api/auth/login",
    {
      schema: {
        summary: "Log in",
        description:
          "Body: `{ handle?, password? }`. In demo mode the body is ignored and a session is issued for the default-administrator. In prod mode, a user with `password_hash IS NULL` (kind=human) is granted passwordless-once login but cannot make write requests until they set a password.",
        tags: ["auth"],
        body: {
          type: "object",
          properties: {
            handle: { type: "string", minLength: 1, maxLength: 64 },
            password: { type: "string", maxLength: 512 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const body = (req.body ?? {}) as LoginRequest;

      let userRow: typeof users.$inferSelect | undefined;
      if (app.demo) {
        userRow = app.db.select().from(users).where(eq(users.id, DEFAULT_ADMINISTRATOR_ID)).get();
        if (!userRow) return reply.code(500).send({ error: "Default administrator missing in demo mode" });
      } else {
        if (!body.handle) return reply.code(400).send({ error: "Missing handle" });
        const normalized = body.handle.toLowerCase();
        userRow = app.db
          .select()
          .from(users)
          .where(eq(sql`lower(${users.handle})`, normalized))
          .get();
        if (!userRow) return reply.code(401).send({ error: "Invalid credentials" });
        if (userRow.deletedAt) return reply.code(401).send({ error: "Invalid credentials" });
        if (userRow.kind !== "human") return reply.code(401).send({ error: "Invalid credentials" });

        if (userRow.passwordHash !== null) {
          if (!body.password) return reply.code(401).send({ error: "Invalid credentials" });
          const ok = await verifyPassword(body.password, userRow.passwordHash);
          if (!ok) return reply.code(401).send({ error: "Invalid credentials" });
        }
        // else: passwordless-once login is allowed; force-change rule kicks in on writes.
      }

      const session = createSession(app.db, userRow.id, app.config.sessionIdleDays);
      setSessionCookie(reply, session.id, session.maxAgeSeconds, secure);
      return { actor: toAuthMe(userRow, app.demo) };
    },
  );

  app.post(
    "/api/auth/logout",
    {
      schema: { summary: "Log out (current session)", tags: ["auth"] },
    },
    async (req, reply) => {
      const actor = req.actor!;
      if (actor.authMethod === "session" && actor.sessionId) {
        deleteSession(app.db, actor.sessionId);
      }
      clearSessionCookie(reply, secure);
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/auth/logout-all",
    {
      schema: { summary: "Log out of all sessions for the current actor", tags: ["auth"] },
    },
    async (req, reply) => {
      const actor = req.actor!;
      deleteSessionsForUser(app.db, actor.id);
      clearSessionCookie(reply, secure);
      return reply.code(204).send();
    },
  );

  app.get(
    "/api/auth/me",
    {
      schema: { summary: "Get the current actor", tags: ["auth"] },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const row = app.db.select().from(users).where(eq(users.id, actor.id)).get();
      if (!row) return reply.code(401).send({ error: "User not found" });
      return toAuthMe(row, app.demo);
    },
  );

  app.post(
    "/api/auth/change-password",
    {
      schema: {
        summary: "Change own password",
        description:
          "If the actor's `password_hash IS NULL` (passwordless-once flow), `current_password` is ignored. Otherwise it must be provided and verified.",
        tags: ["auth"],
        body: {
          type: "object",
          required: ["new_password"],
          properties: {
            current_password: { type: "string", maxLength: 512 },
            new_password: { type: "string", minLength: 8, maxLength: 512 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const body = req.body as ChangePasswordRequest;

      const row = app.db.select().from(users).where(eq(users.id, actor.id)).get();
      if (!row) return reply.code(404).send({ error: "User not found" });

      if (row.passwordHash !== null) {
        if (!body.current_password) return reply.code(400).send({ error: "Missing current_password" });
        const ok = await verifyPassword(body.current_password, row.passwordHash);
        if (!ok) return reply.code(403).send({ error: "Current password incorrect" });
      }

      const newHash = await hashPassword(body.new_password);
      app.db.update(users).set({ passwordHash: newHash }).where(eq(users.id, actor.id)).run();
      // Invalidate all other sessions for this user (keep current).
      if (actor.authMethod === "session" && actor.sessionId) {
        deleteSessionsForUser(app.db, actor.id, actor.sessionId);
      } else {
        deleteSessionsForUser(app.db, actor.id);
      }
      return reply.code(204).send();
    },
  );
};
