import type { FastifyPluginAsync } from "fastify";
import type { CreateSpaceRequest, UpdateSpaceRequest } from "@agentic-kanban/shared";
import {
  CannotDeleteDefaultSpaceError,
  SpaceArchiveBlockedError,
  SpaceNotEmptyError,
  SpaceNotFoundError,
  archiveSpace,
  createSpace,
  deleteSpace,
  getSpace,
  listSpaces,
  unarchiveSpace,
  updateSpace,
} from "../services/spaces.js";

export const spacesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/spaces",
    {
      schema: {
        summary: "List spaces (archived excluded by default)",
        tags: ["spaces"],
        querystring: {
          type: "object",
          properties: {
            include_archived: { type: "string", enum: ["true", "false"] },
          },
        },
      },
    },
    async (req) => {
      const includeArchived =
        (req.query as { include_archived?: string }).include_archived === "true";
      return listSpaces(app.db, { includeArchived });
    },
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
        summary: "Delete a space (only when it has no tasks; empty projects cascade)",
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
            .send({ error: "Space still has tasks; move or delete them first" });
        if (err instanceof SpaceNotFoundError)
          return reply.code(404).send({ error: "Space not found" });
        throw err;
      }
    },
  );

  app.post(
    "/api/spaces/:id/archive",
    {
      schema: {
        summary: "Archive a space (only when every task in it is already archived)",
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
        return archiveSpace(app.db, (req.params as { id: string }).id);
      } catch (err) {
        if (err instanceof SpaceArchiveBlockedError)
          return reply
            .code(400)
            .send({ error: "Space has unarchived tasks; archive them first" });
        if (err instanceof SpaceNotFoundError)
          return reply.code(404).send({ error: "Space not found" });
        throw err;
      }
    },
  );

  app.post(
    "/api/spaces/:id/unarchive",
    {
      schema: {
        summary: "Unarchive a space",
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
        return unarchiveSpace(app.db, (req.params as { id: string }).id);
      } catch (err) {
        if (err instanceof SpaceNotFoundError)
          return reply.code(404).send({ error: "Space not found" });
        throw err;
      }
    },
  );
};
