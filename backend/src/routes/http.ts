import type { FastifyReply } from "fastify";
import type { DomainErrorCode } from "@fjord/shared";

/**
 * Shared error-response helpers for route handlers.
 *
 * Each returns the `FastifyReply` so handlers can `return notFound(reply, "Task")`.
 * They cover the common shapes; responses carrying extra fields (e.g. a version
 * conflict's `current_version`) stay inline at the call site.
 */

export function notFound(reply: FastifyReply, resource = "Resource"): FastifyReply {
  return reply.code(404).send({ error: `${resource} not found` });
}

export function forbidden(reply: FastifyReply, message = "Forbidden"): FastifyReply {
  return reply.code(403).send({ error: message });
}

export function badRequest(reply: FastifyReply, message: string, code?: DomainErrorCode): FastifyReply {
  return reply.code(400).send(code ? { error: message, code } : { error: message });
}

export function conflict(reply: FastifyReply, message: string, code?: DomainErrorCode): FastifyReply {
  return reply.code(409).send(code ? { error: message, code } : { error: message });
}
