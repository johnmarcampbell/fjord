import type { FastifyPluginAsync } from "fastify";
import { idParam } from "./schemas.js";
import { asc, eq, inArray } from "drizzle-orm";
import {
  DEFAULT_SPACE_ID,
  type CreateProjectRequest,
  type UpdateProjectRequest,
} from "@fjord/shared";
import { projects, tasks } from "../db/schema.js";
import { newId, nowIso } from "../services/tasks.js";
import { assertSpaceWriteable, moveProjectToSpace } from "../services/spaces.js";
import { canAccessSpace } from "../auth/policy.js";
import { forbidden, notFound } from "./http.js";
import { mapSpaceWriteError } from "./errors.js";

function toProject(row: typeof projects.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
    due_at: row.dueAt,
    created_at: row.createdAt,
    space_id: row.spaceId,
  };
}

export const projectsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/projects",
    {
      schema: {
        summary: "List all projects",
        tags: ["projects"],
        querystring: {
          type: "object",
          properties: {
            space_id: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const actor = req.actor!;
      const { space_id } = req.query as { space_id?: string };
      const query = app.db.select().from(projects).orderBy(asc(projects.createdAt));
      let rows;
      if (space_id) {
        rows = query.where(eq(projects.spaceId, space_id)).all();
      } else if (actor.accessibleSpaceIds === "all") {
        rows = query.all();
      } else {
        const ids = [...actor.accessibleSpaceIds];
        if (ids.length === 0) return [];
        rows = query.where(inArray(projects.spaceId, ids)).all();
      }
      return rows.map(toProject);
    },
  );

  app.get(
    "/api/projects/:id",
    {
      schema: {
        summary: "Get a single project",
        tags: ["projects"],
        params: idParam,
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const actor = req.actor!;
      const row = app.db.select().from(projects).where(eq(projects.id, id)).get();
      if (!row) return notFound(reply, "Project");
      if (!canAccessSpace(actor, row.spaceId)) return forbidden(reply);
      return toProject(row);
    },
  );

  app.post(
    "/api/projects",
    {
      schema: {
        summary: "Create a project",
        tags: ["projects"],
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", minLength: 1, maxLength: 128 },
            color: { type: "string", default: "#4A7FA5" },
            description: { type: "string", default: "" },
            due_at: { type: ["string", "null"] },
            space_id: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const body = req.body as CreateProjectRequest;
      const spaceId = body.space_id ?? DEFAULT_SPACE_ID;
      if (!canAccessSpace(actor, spaceId)) return forbidden(reply);
      try {
        assertSpaceWriteable(app.db, spaceId);
      } catch (err) {
        const handled = mapSpaceWriteError(reply, err);
        if (handled) return handled;
        throw err;
      }
      const row = {
        id: newId(),
        name: body.name,
        color: body.color ?? "#4A7FA5",
        description: body.description ?? "",
        dueAt: body.due_at ?? null,
        createdAt: nowIso(),
        spaceId,
      };
      app.db.insert(projects).values(row).run();
      reply.code(201);
      return toProject(row);
    },
  );

  app.patch(
    "/api/projects/:id",
    {
      schema: {
        summary: "Update a project (set space_id to move it; child tasks move too)",
        tags: ["projects"],
        params: idParam,
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 128 },
            color: { type: "string" },
            description: { type: "string" },
            due_at: { type: ["string", "null"] },
            space_id: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as UpdateProjectRequest;
      const actor = req.actor!;
      const existing = app.db.select().from(projects).where(eq(projects.id, id)).get();
      if (!existing) return notFound(reply, "Project");
      if (!canAccessSpace(actor, existing.spaceId)) return forbidden(reply);

      if (body.space_id && body.space_id !== existing.spaceId) {
        if (!canAccessSpace(actor, body.space_id)) return forbidden(reply);
        try {
          moveProjectToSpace(app.db, app.events, actor.id, id, body.space_id);
        } catch (err) {
          const handled = mapSpaceWriteError(reply, err);
          if (handled) return handled;
          throw err;
        }
      }

      const updates = {
        name: body.name ?? existing.name,
        color: body.color ?? existing.color,
        description: body.description ?? existing.description,
        dueAt: body.due_at === undefined ? existing.dueAt : body.due_at,
      };
      app.db.update(projects).set(updates).where(eq(projects.id, id)).run();
      const updated = app.db.select().from(projects).where(eq(projects.id, id)).get()!;
      return toProject(updated);
    },
  );

  app.delete(
    "/api/projects/:id",
    {
      schema: {
        summary: "Delete a project (tasks lose their project assignment)",
        tags: ["projects"],
        params: idParam,
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const actor = req.actor!;
      const existing = app.db.select().from(projects).where(eq(projects.id, id)).get();
      if (!existing) return notFound(reply, "Project");
      if (!canAccessSpace(actor, existing.spaceId)) return forbidden(reply);
      app.db.update(tasks).set({ projectId: null }).where(eq(tasks.projectId, id)).run();
      app.db.delete(projects).where(eq(projects.id, id)).run();
      reply.code(204);
    },
  );
};
