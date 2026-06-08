/**
 * Shared Fastify schema fragments reused across route definitions.
 */

/** Path params for routes keyed by a single `:id`. */
export const idParam = {
  type: "object",
  properties: { id: { type: "string" } },
  required: ["id"],
};
