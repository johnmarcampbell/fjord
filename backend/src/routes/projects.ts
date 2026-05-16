import type { FastifyPluginAsync } from "fastify";
import { asc, eq } from "drizzle-orm";
import type { CreateProjectRequest, UpdateProjectRequest } from "@agentic-kanban/shared";
import { projects, tasks } from "../db/schema.js";
import { newId, nowIso } from "../services/tasks.js";

function toProject(row: typeof projects.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
    due_at: row.dueAt,
    created_at: row.createdAt,
  };
}

export const projectsRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/projects",
    { schema: { summary: "List all projects", tags: ["projects"] } },
    async () => {
      return app.db.select().from(projects).orderBy(asc(projects.createdAt)).all().map(toProject);
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
          },
        },
      },
    },
    async (req, reply) => {
      const body = req.body as CreateProjectRequest;
      const row = {
        id: newId(),
        name: body.name,
        color: body.color ?? "#4A7FA5",
        description: body.description ?? "",
        dueAt: body.due_at ?? null,
        createdAt: nowIso(),
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
        summary: "Update a project",
        tags: ["projects"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string", minLength: 1, maxLength: 128 },
            color: { type: "string" },
            description: { type: "string" },
            due_at: { type: ["string", "null"] },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as UpdateProjectRequest;
      const existing = app.db.select().from(projects).where(eq(projects.id, id)).get();
      if (!existing) return reply.code(404).send({ error: "Project not found" });
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
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const existing = app.db.select().from(projects).where(eq(projects.id, id)).get();
      if (!existing) return reply.code(404).send({ error: "Project not found" });
      app.db.update(tasks).set({ projectId: null }).where(eq(tasks.projectId, id)).run();
      app.db.delete(projects).where(eq(projects.id, id)).run();
      reply.code(204);
    },
  );
};
