import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import type {
  AddBlockerRequest,
  AddCommentRequest,
  Column,
  CreateTaskRequest,
  TaskEvent,
  UpdateTaskRequest,
} from "@agentic-kanban/shared";
import { COLUMNS } from "@agentic-kanban/shared";
import { taskDependencies, taskEvents, tasks, users, projects } from "../db/schema.js";
import {
  columnHeadPosition,
  columnTailPosition,
  hydrateTask,
  newId,
  nowIso,
  wouldCreateCycle,
} from "../services/tasks.js";

const ACTOR_HEADER = "x-user-id";

function getActorId(req: FastifyRequest): string | null {
  const v = req.headers[ACTOR_HEADER];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function requireActor(req: FastifyRequest, reply: any): string | null {
  const actor = getActorId(req);
  if (!actor) {
    reply.code(400).send({ error: `Missing required header: ${ACTOR_HEADER}` });
    return null;
  }
  const exists = req.server.db.select().from(users).where(eq(users.id, actor)).get();
  if (!exists) {
    if (req.server.demo) {
      req.server.db.insert(users).values({ id: actor, displayName: actor, kind: "human", createdAt: nowIso() }).run();
    } else {
      reply.code(400).send({ error: `Unknown user in ${ACTOR_HEADER}: ${actor}` });
      return null;
    }
  }
  return actor;
}

function toEvent(row: typeof taskEvents.$inferSelect): TaskEvent {
  return {
    id: row.id,
    task_id: row.taskId,
    actor_id: row.actorId,
    kind: row.kind as TaskEvent["kind"],
    created_at: row.createdAt,
    body: row.body,
    from_value: row.fromValue,
    to_value: row.toValue,
    blocker_id: row.blockerId,
  };
}

export const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/api/tasks",
    {
      schema: {
        summary: "List all tasks",
        tags: ["tasks"],
        querystring: {
          type: "object",
          properties: {
            include_archived: { type: "string", enum: ["true", "false"] },
          },
        },
      },
    },
    async (req) => {
      const includeArchived = (req.query as { include_archived?: string }).include_archived === "true";
      const whereCondition = includeArchived ? undefined : eq(tasks.archived, false);
      const query = app.db.select().from(tasks).orderBy(asc(tasks.position));
      const rows = whereCondition ? query.where(whereCondition).all() : query.all();
      return rows.map((r) => hydrateTask(app.db, r));
    },
  );

  app.get(
    "/api/tasks/:id",
    {
      schema: {
        summary: "Get a task by id",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const row = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!row) return reply.code(404).send({ error: "Task not found" });
      return hydrateTask(app.db, row);
    },
  );

  app.post(
    "/api/tasks",
    {
      schema: {
        summary: "Create a task",
        tags: ["tasks"],
        body: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string", minLength: 1, maxLength: 256 },
            description: { type: "string", default: "" },
            column: { type: "string", enum: [...COLUMNS] },
            assigned_to: { type: ["string", "null"] },
            due_at: { type: ["string", "null"], format: "date-time" },
            project_id: { type: ["string", "null"] },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const actor = requireActor(req, reply);
      if (!actor) return;
      const body = req.body as CreateTaskRequest;
      const column = (body.column ?? "Backlog") as Column;

      if (body.assigned_to) {
        const u = app.db.select().from(users).where(eq(users.id, body.assigned_to)).get();
        if (!u) return reply.code(400).send({ error: "Unknown assigned_to user" });
      }

      if (body.project_id) {
        const p = app.db.select().from(projects).where(eq(projects.id, body.project_id)).get();
        if (!p) return reply.code(400).send({ error: "Unknown project_id" });
      }

      const id = newId();
      const now = nowIso();
      const position = columnHeadPosition(app.db, column);
      const row = {
        id,
        title: body.title,
        description: body.description ?? "",
        column,
        position,
        reportedBy: actor,
        assignedTo: body.assigned_to ?? null,
        dueAt: body.due_at ?? null,
        projectId: body.project_id ?? null,
        tags: JSON.stringify(body.tags ?? []),
        createdAt: now,
        updatedAt: now,
        version: 1,
        archived: false,
        archivedAt: null,
      };
      app.db.insert(tasks).values(row).run();
      app.db
        .insert(taskEvents)
        .values({
          id: newId(),
          taskId: id,
          actorId: actor,
          kind: "task_created",
          createdAt: now,
          body: null,
          fromValue: null,
          toValue: null,
          blockerId: null,
        })
        .run();

      app.events.publish({ type: "task.created", task_id: id });
      reply.code(201);
      return hydrateTask(app.db, { ...row });
    },
  );

  app.patch(
    "/api/tasks/:id",
    {
      schema: {
        summary: "Update a task (optimistic concurrency via version)",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          required: ["version"],
          properties: {
            version: { type: "integer", minimum: 1 },
            title: { type: "string", minLength: 1, maxLength: 256 },
            description: { type: "string" },
            column: { type: "string", enum: [...COLUMNS] },
            position: { type: "number" },
            assigned_to: { type: ["string", "null"] },
            due_at: { type: ["string", "null"], format: "date-time" },
            project_id: { type: ["string", "null"] },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const actor = requireActor(req, reply);
      if (!actor) return;
      const { id } = req.params as { id: string };
      const body = req.body as UpdateTaskRequest;

      const existing = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) return reply.code(404).send({ error: "Task not found" });
      if (existing.version !== body.version) {
        return reply.code(409).send({
          error: "Version conflict",
          current_version: existing.version,
        });
      }

      if (body.assigned_to !== undefined && body.assigned_to !== null) {
        const u = app.db.select().from(users).where(eq(users.id, body.assigned_to)).get();
        if (!u) return reply.code(400).send({ error: "Unknown assigned_to user" });
      }

      if (body.project_id !== undefined && body.project_id !== null) {
        const p = app.db.select().from(projects).where(eq(projects.id, body.project_id)).get();
        if (!p) return reply.code(400).send({ error: "Unknown project_id" });
      }

      const now = nowIso();
      const nextColumn = (body.column ?? existing.column) as Column;
      let nextPosition = existing.position;
      if (body.position !== undefined) {
        nextPosition = body.position;
      } else if (body.column && body.column !== existing.column) {
        nextPosition = columnTailPosition(app.db, nextColumn);
      }

      const newProjectId = body.project_id === undefined ? existing.projectId : body.project_id;
      const newTagsArr = body.tags !== undefined ? body.tags : (JSON.parse(existing.tags) as string[]);
      const newTagsStr = JSON.stringify(newTagsArr);

      const updates = {
        title: body.title ?? existing.title,
        description: body.description ?? existing.description,
        column: nextColumn,
        position: nextPosition,
        assignedTo: body.assigned_to === undefined ? existing.assignedTo : body.assigned_to,
        dueAt: body.due_at === undefined ? existing.dueAt : body.due_at,
        projectId: newProjectId,
        tags: newTagsStr,
        updatedAt: now,
        version: existing.version + 1,
      };
      app.db.update(tasks).set(updates).where(eq(tasks.id, id)).run();

      const eventRows: Array<typeof taskEvents.$inferInsert> = [];
      const mkEvent = (
        kind: TaskEvent["kind"],
        fromValue: string | null,
        toValue: string | null,
      ) => ({
        id: newId(),
        taskId: id,
        actorId: actor,
        kind,
        createdAt: now,
        body: null,
        fromValue,
        toValue,
        blockerId: null,
      });
      if (updates.column !== existing.column) {
        eventRows.push(mkEvent("column_changed", existing.column, updates.column));
      }
      if (updates.assignedTo !== existing.assignedTo) {
        eventRows.push(mkEvent("assigned_to_changed", existing.assignedTo, updates.assignedTo));
      }
      if (updates.dueAt !== existing.dueAt) {
        eventRows.push(mkEvent("due_date_changed", existing.dueAt, updates.dueAt));
      }
      if (updates.projectId !== existing.projectId) {
        eventRows.push(mkEvent("project_changed", existing.projectId, updates.projectId));
      }
      if (updates.tags !== existing.tags) {
        eventRows.push(mkEvent("tags_changed", existing.tags, updates.tags));
      }
      if (eventRows.length) {
        app.db.insert(taskEvents).values(eventRows).run();
      }

      app.events.publish({ type: "task.updated", task_id: id, version: updates.version });
      const newRow = app.db.select().from(tasks).where(eq(tasks.id, id)).get()!;
      return hydrateTask(app.db, newRow);
    },
  );

  app.delete(
    "/api/tasks/:id",
    {
      schema: {
        summary: "Delete a task",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const actor = requireActor(req, reply);
      if (!actor) return;
      const { id } = req.params as { id: string };
      const existing = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) return reply.code(404).send({ error: "Task not found" });
      app.db.delete(tasks).where(eq(tasks.id, id)).run();
      app.events.publish({ type: "task.deleted", task_id: id });
      reply.code(204);
    },
  );

  app.get(
    "/api/tasks/:id/events",
    {
      schema: {
        summary: "List events (comments + system events) for a task",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const existing = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) return reply.code(404).send({ error: "Task not found" });
      const rows = app.db
        .select()
        .from(taskEvents)
        .where(eq(taskEvents.taskId, id))
        .orderBy(asc(taskEvents.createdAt))
        .all();
      return rows.map(toEvent);
    },
  );

  app.post(
    "/api/tasks/:id/comments",
    {
      schema: {
        summary: "Add a comment to a task",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          required: ["body"],
          properties: { body: { type: "string", minLength: 1, maxLength: 10000 } },
        },
      },
    },
    async (req, reply) => {
      const actor = requireActor(req, reply);
      if (!actor) return;
      const { id } = req.params as { id: string };
      const existing = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) return reply.code(404).send({ error: "Task not found" });
      const { body } = req.body as AddCommentRequest;
      const eventId = newId();
      const row = {
        id: eventId,
        taskId: id,
        actorId: actor,
        kind: "comment" as const,
        createdAt: nowIso(),
        body,
        fromValue: null,
        toValue: null,
        blockerId: null,
      };
      app.db.insert(taskEvents).values(row).run();
      app.events.publish({ type: "task.event_added", task_id: id, event_id: eventId });
      reply.code(201);
      return toEvent(row);
    },
  );

  app.post(
    "/api/tasks/:id/blockers",
    {
      schema: {
        summary: "Add a blocking dependency: another task blocks this one",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          required: ["blocker_id"],
          properties: { blocker_id: { type: "string" } },
        },
      },
    },
    async (req, reply) => {
      const actor = requireActor(req, reply);
      if (!actor) return;
      const { id } = req.params as { id: string };
      const { blocker_id: blockerId } = req.body as AddBlockerRequest;

      const blocked = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!blocked) return reply.code(404).send({ error: "Task not found" });
      const blocker = app.db.select().from(tasks).where(eq(tasks.id, blockerId)).get();
      if (!blocker) return reply.code(400).send({ error: "Unknown blocker task" });

      if (wouldCreateCycle(app.db, blockerId, id)) {
        return reply.code(400).send({ error: "Adding this dependency would create a cycle" });
      }

      const existingDep = app.db
        .select()
        .from(taskDependencies)
        .where(
          and(
            eq(taskDependencies.blockerId, blockerId),
            eq(taskDependencies.blockedId, id),
          ),
        )
        .get();
      if (existingDep) {
        return reply.code(409).send({ error: "Dependency already exists" });
      }

      app.db.insert(taskDependencies).values({ blockerId, blockedId: id }).run();
      const eventId = newId();
      app.db
        .insert(taskEvents)
        .values({
          id: eventId,
          taskId: id,
          actorId: actor,
          kind: "blocker_added",
          createdAt: nowIso(),
          body: null,
          fromValue: null,
          toValue: null,
          blockerId,
        })
        .run();
      app.events.publish({ type: "task.event_added", task_id: id, event_id: eventId });
      app.events.publish({ type: "task.updated", task_id: id, version: blocked.version });
      reply.code(201);
      return hydrateTask(app.db, blocked);
    },
  );

  app.delete(
    "/api/tasks/:id/blockers/:blocker_id",
    {
      schema: {
        summary: "Remove a blocking dependency",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" }, blocker_id: { type: "string" } },
          required: ["id", "blocker_id"],
        },
      },
    },
    async (req, reply) => {
      const actor = requireActor(req, reply);
      if (!actor) return;
      const { id, blocker_id: blockerId } = req.params as {
        id: string;
        blocker_id: string;
      };
      const dep = app.db
        .select()
        .from(taskDependencies)
        .where(
          and(
            eq(taskDependencies.blockerId, blockerId),
            eq(taskDependencies.blockedId, id),
          ),
        )
        .get();
      if (!dep) return reply.code(404).send({ error: "Dependency not found" });
      app.db
        .delete(taskDependencies)
        .where(
          and(
            eq(taskDependencies.blockerId, blockerId),
            eq(taskDependencies.blockedId, id),
          ),
        )
        .run();
      const eventId = newId();
      app.db
        .insert(taskEvents)
        .values({
          id: eventId,
          taskId: id,
          actorId: actor,
          kind: "blocker_removed",
          createdAt: nowIso(),
          body: null,
          fromValue: null,
          toValue: null,
          blockerId,
        })
        .run();
      app.events.publish({ type: "task.event_added", task_id: id, event_id: eventId });
      app.events.publish({ type: "task.updated", task_id: id, version: 0 });
      reply.code(204);
    },
  );

  app.post(
    "/api/tasks/:id/archive",
    {
      schema: {
        summary: "Archive a task",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const actor = requireActor(req, reply);
      if (!actor) return;
      const { id } = req.params as { id: string };
      const task = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!task) return reply.code(404).send({ error: "Task not found" });
      if (task.column !== "Done") {
        return reply.code(400).send({ error: "Can only archive tasks in Done column" });
      }
      const eventId = newId();
      app.db
        .update(tasks)
        .set({
          archived: true,
          archivedAt: nowIso(),
          version: task.version + 1,
          updatedAt: nowIso(),
        })
        .where(eq(tasks.id, id))
        .run();
      app.db
        .insert(taskEvents)
        .values({
          id: eventId,
          taskId: id,
          actorId: actor,
          kind: "task_archived",
          createdAt: nowIso(),
          body: null,
          fromValue: null,
          toValue: null,
          blockerId: null,
        })
        .run();
      app.events.publish({ type: "task.event_added", task_id: id, event_id: eventId });
      app.events.publish({ type: "task.updated", task_id: id, version: task.version + 1 });
      reply.code(200);
      const updated = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      return hydrateTask(app.db, updated!);
    },
  );

  app.post(
    "/api/tasks/:id/unarchive",
    {
      schema: {
        summary: "Unarchive a task",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      const actor = requireActor(req, reply);
      if (!actor) return;
      const { id } = req.params as { id: string };
      const task = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!task) return reply.code(404).send({ error: "Task not found" });
      if (!task.archived) {
        return reply.code(400).send({ error: "Task is not archived" });
      }
      const eventId = newId();
      app.db
        .update(tasks)
        .set({
          archived: false,
          archivedAt: null,
          version: task.version + 1,
          updatedAt: nowIso(),
        })
        .where(eq(tasks.id, id))
        .run();
      app.db
        .insert(taskEvents)
        .values({
          id: eventId,
          taskId: id,
          actorId: actor,
          kind: "task_unarchived",
          createdAt: nowIso(),
          body: null,
          fromValue: null,
          toValue: null,
          blockerId: null,
        })
        .run();
      app.events.publish({ type: "task.event_added", task_id: id, event_id: eventId });
      app.events.publish({ type: "task.updated", task_id: id, version: task.version + 1 });
      reply.code(200);
      const updated = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      return hydrateTask(app.db, updated!);
    },
  );
};
