import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  AddBlockerRequest,
  AddCommentRequest,
  AddJournalEntryRequest,
  CreateTaskRequest,
  EventKind,
  UpdateTaskRequest,
} from "@agentic-kanban/shared";
import { COLUMNS, EVENT_KINDS } from "@agentic-kanban/shared";
import { taskEvents, tasks, users } from "../db/schema.js";
import {
  BlockerNotFoundError,
  CycleError,
  DependencyNotFoundError,
  DuplicateDependencyError,
  TaskNotFoundError,
  TaskStateError,
  UnknownProjectError,
  UnknownUserError,
  VersionConflictError,
  addBlocker,
  addComment,
  addJournalEntry,
  archiveTask,
  createTask,
  deleteTask,
  hydrateTask,
  nowIso,
  removeBlocker,
  toEvent,
  unarchiveTask,
  updateTask,
} from "../services/tasks.js";

const ACTOR_HEADER = "x-user-id";

function getActorId(req: FastifyRequest): string | null {
  const v = req.headers[ACTOR_HEADER];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function requireActor(req: FastifyRequest, reply: FastifyReply): string | null {
  const actor = getActorId(req);
  if (!actor) {
    reply.code(400).send({ error: `Missing required header: ${ACTOR_HEADER}` });
    return null;
  }
  const exists = req.server.db.select().from(users).where(eq(users.id, actor)).get();
  if (!exists) {
    if (req.server.demo) {
      req.server.db
        .insert(users)
        .values({ id: actor, displayName: actor, kind: "human", createdAt: nowIso() })
        .run();
    } else {
      reply.code(400).send({ error: `Unknown user in ${ACTOR_HEADER}: ${actor}` });
      return null;
    }
  }
  return actor;
}

const KNOWN_EVENT_KINDS: ReadonlySet<EventKind> = new Set(EVENT_KINDS);

function parseKindFilter(raw: string | undefined): EventKind[] | null {
  if (!raw) return null;
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (!parts.length) return null;
  const out: EventKind[] = [];
  for (const part of parts) {
    if (KNOWN_EVENT_KINDS.has(part as EventKind)) {
      out.push(part as EventKind);
    }
  }
  return out.length ? out : [];
}

function mapServiceError(err: unknown, reply: FastifyReply): void {
  if (err instanceof TaskNotFoundError) {
    reply.code(404).send({ error: "Task not found" });
  } else if (err instanceof VersionConflictError) {
    reply.code(409).send({ error: "Version conflict", current_version: err.currentVersion });
  } else if (err instanceof UnknownUserError) {
    reply.code(400).send({ error: "Unknown assigned_to user" });
  } else if (err instanceof UnknownProjectError) {
    reply.code(400).send({ error: "Unknown project_id" });
  } else if (err instanceof BlockerNotFoundError) {
    reply.code(400).send({ error: "Unknown blocker task" });
  } else if (err instanceof DuplicateDependencyError) {
    reply.code(409).send({ error: "Dependency already exists" });
  } else if (err instanceof CycleError) {
    reply.code(400).send({ error: "Adding this dependency would create a cycle" });
  } else if (err instanceof DependencyNotFoundError) {
    reply.code(404).send({ error: "Dependency not found" });
  } else if (err instanceof TaskStateError) {
    reply.code(400).send({ error: err.message });
  } else {
    throw err;
  }
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
      const includeArchived =
        (req.query as { include_archived?: string }).include_archived === "true";
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
      try {
        reply.code(201);
        return createTask(app.db, app.events, actor, req.body as CreateTaskRequest);
      } catch (err) {
        mapServiceError(err, reply);
      }
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
      try {
        return updateTask(app.db, app.events, actor, id, req.body as UpdateTaskRequest);
      } catch (err) {
        mapServiceError(err, reply);
      }
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
      try {
        deleteTask(app.db, app.events, id);
        reply.code(204);
      } catch (err) {
        mapServiceError(err, reply);
      }
    },
  );

  app.get(
    "/api/tasks/:id/events",
    {
      schema: {
        summary: "List events for a task (comments, journal entries, system events)",
        description:
          "Returns the task's full timeline in chronological order. " +
          "Use `?kind=journal_entry` (or a CSV like `?kind=journal_entry,comment`) " +
          "to filter by event kind — recommended for agents catching up on a task, " +
          "since it returns only the durable working notes and skips system noise.",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        querystring: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              description:
                "Comma-separated list of EventKind values to include. Unknown kinds are ignored.",
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const existing = app.db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) return reply.code(404).send({ error: "Task not found" });
      const { kind: kindParam } = req.query as { kind?: string };
      const kinds = parseKindFilter(kindParam);
      if (kinds !== null && kinds.length === 0) return [];
      const whereClause =
        kinds === null
          ? eq(taskEvents.taskId, id)
          : and(eq(taskEvents.taskId, id), inArray(taskEvents.kind, kinds));
      const rows = app.db
        .select()
        .from(taskEvents)
        .where(whereClause)
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
        description:
          "Comments are inter-actor communication on a task (e.g. \"@alice, ready for review\"). " +
          "For an actor's own durable working notes — what they've tried, what worked, what didn't, " +
          "what to try next — use `POST /api/tasks/{id}/journal` instead.",
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
      const { body } = req.body as AddCommentRequest;
      try {
        reply.code(201);
        return addComment(app.db, app.events, actor, id, body);
      } catch (err) {
        mapServiceError(err, reply);
      }
    },
  );

  app.post(
    "/api/tasks/:id/journal",
    {
      schema: {
        summary: "Append a journal entry to a task",
        description:
          "Append a journal entry — a durable working note on this task. The journal is the " +
          "assignee's working memory: record what you've tried, what worked, what didn't, " +
          "and what you plan to try next.\n\n" +
          "Recommended agent workflow: before starting work on a task, fetch " +
          "`GET /api/tasks/{id}/events?kind=journal_entry` and read prior entries. " +
          "Then post a fresh entry summarizing the current state and your plan.\n\n" +
          "Use comments (`POST /api/tasks/{id}/comments`) for talking to other actors. " +
          "Use the journal for talking to your future self.\n\n" +
          "Anyone may post a journal entry on any task, but the convention is that the journal " +
          "belongs to the assignee; non-assignee entries are rendered as side notes in the UI.",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        body: {
          type: "object",
          required: ["body"],
          properties: { body: { type: "string", minLength: 1, maxLength: 100000 } },
        },
      },
    },
    async (req, reply) => {
      const actor = requireActor(req, reply);
      if (!actor) return;
      const { id } = req.params as { id: string };
      const { body } = req.body as AddJournalEntryRequest;
      try {
        reply.code(201);
        return addJournalEntry(app.db, app.events, actor, id, body);
      } catch (err) {
        mapServiceError(err, reply);
      }
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
          properties: { blocker_id: { type: "string", description: "The task ID of the task that should block this task (not a dependency/link ID)" } },
        },
      },
    },
    async (req, reply) => {
      const actor = requireActor(req, reply);
      if (!actor) return;
      const { id } = req.params as { id: string };
      const { blocker_id: blockerId } = req.body as AddBlockerRequest;
      try {
        reply.code(201);
        return addBlocker(app.db, app.events, actor, id, blockerId);
      } catch (err) {
        mapServiceError(err, reply);
      }
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
          properties: { id: { type: "string" }, blocker_id: { type: "string", description: "The task ID of the blocking task (not a dependency/link ID)" } },
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
      try {
        removeBlocker(app.db, app.events, actor, id, blockerId);
        reply.code(204);
      } catch (err) {
        mapServiceError(err, reply);
      }
    },
  );

  app.post(
    "/api/tasks/:id/archive",
    {
      schema: {
        summary: "Archive a task",
        description:
          "Archive a task. The task must be in the Done column or this request will fail with 400. Archived tasks are excluded from GET /api/tasks by default; pass include_archived=true to retrieve them.",
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
      try {
        reply.code(200);
        return archiveTask(app.db, app.events, actor, id);
      } catch (err) {
        mapServiceError(err, reply);
      }
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
      try {
        reply.code(200);
        return unarchiveTask(app.db, app.events, actor, id);
      } catch (err) {
        mapServiceError(err, reply);
      }
    },
  );
};
