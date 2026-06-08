import type { FastifyReply } from "fastify";
import { SpaceArchivedError, UnknownSpaceError } from "../services/spaces.js";
import { AssigneeNoAccessError } from "../services/tasks.js";
import { badRequest } from "./http.js";

/**
 * Map a space-write service error — unknown space, archived destination, or an
 * assignee that would lose access — to a 400 response. Returns the reply when it
 * handled the error, or null when the error is unrelated (caller should rethrow).
 * Centralizes the mapping shared by the task and project routes.
 *
 * Lives here rather than in `http.ts` so that module stays a generic, dependency-free
 * set of reply helpers; this mapper deliberately knows about specific domain errors.
 */
export function mapSpaceWriteError(reply: FastifyReply, err: unknown): FastifyReply | null {
  if (err instanceof UnknownSpaceError) return badRequest(reply, "Unknown space_id");
  if (err instanceof SpaceArchivedError) return badRequest(reply, "Target space is archived");
  if (err instanceof AssigneeNoAccessError) return badRequest(reply, err.message);
  return null;
}
