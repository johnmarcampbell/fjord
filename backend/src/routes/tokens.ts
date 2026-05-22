import type { FastifyPluginAsync } from "fastify";
import { and, eq, isNull, or } from "drizzle-orm";
import type { ApiTokenSummary, CreateApiTokenRequest } from "@agentic-kanban/shared";
import { apiTokens, users } from "../db/schema.js";
import { issueToken, revokeToken } from "../services/api_tokens.js";

function toSummary(row: typeof apiTokens.$inferSelect): ApiTokenSummary {
  return {
    id: row.id,
    user_id: row.userId,
    name: row.name,
    preview: row.preview,
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
    expires_at: row.expiresAt,
    revoked_at: row.revokedAt,
  };
}

function canManageTokens(actorId: string, targetId: string, isAdmin: boolean): boolean {
  return isAdmin || actorId === targetId;
}

export const tokensRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/api/users/:id/tokens",
    {
      schema: {
        summary: "Issue an API token for a user",
        description:
          "Returns the plaintext token exactly once. Caller must be the target user or an Admin.",
        tags: ["auth"],
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 80 },
            expires_at: { type: ["string", "null"], maxLength: 64 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const actor = req.actor!;
      const isAdmin = actor.accessibleSpaceIds === "all";
      if (!canManageTokens(actor.id, id, isAdmin)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      const target = app.db.select().from(users).where(eq(users.id, id)).get();
      if (!target) return reply.code(404).send({ error: "User not found" });
      if (target.deletedAt) return reply.code(404).send({ error: "User not found" });

      const body = req.body as CreateApiTokenRequest;
      const issued = await issueToken(app.db, {
        userId: id,
        name: body.name,
        expiresAt: body.expires_at ?? null,
      });
      reply.code(201);
      return {
        id: issued.id,
        user_id: issued.userId,
        name: issued.name,
        preview: issued.preview,
        created_at: issued.createdAt,
        last_used_at: null,
        expires_at: issued.expiresAt,
        revoked_at: null,
        token: issued.plaintext,
      };
    },
  );

  app.get(
    "/api/users/:id/tokens",
    {
      schema: {
        summary: "List API tokens for a user",
        description:
          "Returns metadata only — never plaintext or hashes. Pass `?include_revoked=true` to include revoked tokens.",
        tags: ["auth"],
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        querystring: {
          type: "object",
          properties: { include_revoked: { type: "string", enum: ["true", "false"] } },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const actor = req.actor!;
      const isAdmin = actor.accessibleSpaceIds === "all";
      if (!canManageTokens(actor.id, id, isAdmin)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      const { include_revoked } = req.query as { include_revoked?: string };
      const includeRevoked = include_revoked === "true";
      const whereExpr = includeRevoked
        ? eq(apiTokens.userId, id)
        : and(eq(apiTokens.userId, id), or(isNull(apiTokens.revokedAt)));
      const rows = app.db.select().from(apiTokens).where(whereExpr).all();
      return rows.map(toSummary);
    },
  );

  app.delete(
    "/api/users/:id/tokens/:token_id",
    {
      schema: {
        summary: "Revoke an API token",
        description: "Soft-deletes the token by setting `revoked_at`.",
        tags: ["auth"],
        params: {
          type: "object",
          properties: { id: { type: "string" }, token_id: { type: "string" } },
          required: ["id", "token_id"],
        },
      },
    },
    async (req, reply) => {
      const { id, token_id } = req.params as { id: string; token_id: string };
      const actor = req.actor!;
      const isAdmin = actor.accessibleSpaceIds === "all";
      if (!canManageTokens(actor.id, id, isAdmin)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      const row = app.db.select().from(apiTokens).where(eq(apiTokens.id, token_id)).get();
      if (!row || row.userId !== id) return reply.code(404).send({ error: "Token not found" });
      if (!row.revokedAt) revokeToken(app.db, token_id);
      reply.code(204);
    },
  );
};
