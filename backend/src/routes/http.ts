import type { FastifyReply } from "fastify";
import type { DomainErrorCode } from "@fjord/shared";
import { SpaceArchivedError, UnknownSpaceError } from "../services/spaces.js";
import { AssigneeNoAccessError } from "../services/tasks.js";

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

/**
 * Map a space-write service error — unknown space, archived destination, or an
 * assignee that would lose access — to a 400 response. Returns the reply when it
 * handled the error, or null when the error is unrelated (caller should rethrow).
 * Centralizes the mapping shared by the task and project routes.
 */
export function mapSpaceWriteError(reply: FastifyReply, err: unknown): FastifyReply | null {
  if (err instanceof UnknownSpaceError) return badRequest(reply, "Unknown space_id");
  if (err instanceof SpaceArchivedError) return badRequest(reply, "Target space is archived");
  if (err instanceof AssigneeNoAccessError) return badRequest(reply, err.message);
  return null;
}
