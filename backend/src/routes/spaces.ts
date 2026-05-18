import type { FastifyPluginAsync } from "fastify";
import type { CreateSpaceRequest, UpdateSpaceRequest } from "@agentic-kanban/shared";
import {
  CannotDeleteDefaultSpaceError,
  SpaceNotEmptyError,
  SpaceNotFoundError,
  createSpace,
  deleteSpace,
  getSpace,
  listSpaces,
  updateSpace,
} from "../services/spaces.js";

export const spacesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/spaces",
    { schema: { summary: "List all spaces", tags: ["spaces"] } },
    async () => listSpaces(app.db),
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
      try {
        return getSpace(app.db, (req.params as { id: string }).id);
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
      const created = createSpace(app.db, req.body as CreateSpaceRequest);
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
      try {
        return updateSpace(
          app.db,
          (req.params as { id: string }).id,
          req.body as UpdateSpaceRequest,
        );
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
        summary: "Delete a space (only when it has no projects or tasks)",
        tags: ["spaces"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      try {
        deleteSpace(app.db, (req.params as { id: string }).id);
        reply.code(204);
      } catch (err) {
        if (err instanceof CannotDeleteDefaultSpaceError)
          return reply.code(400).send({ error: "Cannot delete the default space" });
        if (err instanceof SpaceNotEmptyError)
          return reply
            .code(400)
            .send({ error: "Space is not empty; move or delete projects and tasks first" });
        if (err instanceof SpaceNotFoundError)
          return reply.code(404).send({ error: "Space not found" });
        throw err;
      }
    },
  );
};
