import type { FastifyPluginAsync } from "fastify";
import { and, eq, isNull, or } from "drizzle-orm";
import type { ApiTokenSummary, CreateApiTokenRequest } from "@agentic-kanban/shared";
import { apiTokens, users } from "../db/schema.js";
import { issueToken, revokeToken } from "../services/api_tokens.js";
import { badRequest, forbidden, notFound } from "./http.js";

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
            // ISO8601 UTC instant, e.g. 2026-12-31T23:59:59Z or with offset.
            // Validated more strictly in the handler — JSON Schema's date-time
            // format isn't enforced by Fastify's default Ajv config.
            expires_at: { type: ["string", "null"], maxLength: 64 },
          },
          additionalProperties: false,
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const actor = req.actor!;
      const isAdmin = actor.role === "Admin";
      if (!canManageTokens(actor.id, id, isAdmin)) {
        return forbidden(reply);
      }
      const target = app.db.select().from(users).where(eq(users.id, id)).get();
      if (!target) return notFound(reply, "User");
      if (target.deletedAt) return notFound(reply, "User");

      const body = req.body as CreateApiTokenRequest;
      let expiresAt: string | null = null;
      if (body.expires_at !== undefined && body.expires_at !== null) {
        const ms = Date.parse(body.expires_at);
        if (!Number.isFinite(ms)) {
          return badRequest(reply, "expires_at must be an ISO8601 timestamp");
        }
        if (ms <= Date.now()) {
          return badRequest(reply, "expires_at must be in the future");
        }
        // Normalize to canonical UTC ISO so downstream comparisons are unambiguous.
        expiresAt = new Date(ms).toISOString();
      }
      const issued = await issueToken(app.db, {
        userId: id,
        name: body.name,
        expiresAt,
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
      const isAdmin = actor.role === "Admin";
      if (!canManageTokens(actor.id, id, isAdmin)) {
        return forbidden(reply);
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
      const isAdmin = actor.role === "Admin";
      if (!canManageTokens(actor.id, id, isAdmin)) {
        return forbidden(reply);
      }
      const row = app.db.select().from(apiTokens).where(eq(apiTokens.id, token_id)).get();
      if (!row || row.userId !== id) return notFound(reply, "Token");
      if (!row.revokedAt) revokeToken(app.db, token_id);
      reply.code(204);
    },
  );
};
