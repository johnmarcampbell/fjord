import type { FastifyPluginAsync, FastifyReply } from "fastify";
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
import { taskEvents, tasks } from "../db/schema.js";
import {
  AssigneeNoAccessError,
  BlockerNotFoundError,
  CycleError,
  DependencyNotFoundError,
  DuplicateDependencyError,
  EventEditForbiddenError,
  EventNotFoundError,
  SpaceProjectMismatchError,
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
  deleteTaskEvent,
  editTaskEvent,
  hydrateTask,
  removeBlocker,
  toEvent,
  unarchiveTask,
  updateTask,
} from "../services/tasks.js";
import { SpaceArchivedError, UnknownSpaceError } from "../services/spaces.js";
import { canAccessSpace } from "../auth/policy.js";
import type { Actor } from "../auth/actor.js";
import type { DB } from "../db/index.js";

const KNOWN_EVENT_KINDS: ReadonlySet<EventKind> = new Set(EVENT_KINDS);

/**
 * Load a task by id and enforce that the actor has access to its space.
 * Returns the task row on success; sends a 404/403 response and returns null otherwise.
 */
function loadTaskForActor(
  db: DB,
  actor: Actor,
  taskId: string,
  reply: FastifyReply,
): typeof tasks.$inferSelect | null {
  const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!row) {
    reply.code(404).send({ error: "Task not found" });
    return null;
  }
  if (!canAccessSpace(actor, row.spaceId)) {
    reply.code(403).send({ error: "Forbidden" });
    return null;
  }
  return row;
}

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
    reply
      .code(409)
      .send({ error: "Version conflict", code: "version_conflict", current_version: err.currentVersion });
  } else if (err instanceof UnknownUserError) {
    reply.code(400).send({ error: "Unknown assigned_to user" });
  } else if (err instanceof UnknownProjectError) {
    reply.code(400).send({ error: "Unknown project_id" });
  } else if (err instanceof UnknownSpaceError) {
    reply.code(400).send({ error: "Unknown space_id" });
  } else if (err instanceof SpaceArchivedError) {
    reply.code(400).send({ error: "Target space is archived" });
  } else if (err instanceof SpaceProjectMismatchError) {
    reply
      .code(400)
      .send({ error: "space_id conflicts with the project's space; move the project instead" });
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
  } else if (err instanceof AssigneeNoAccessError) {
    reply.code(400).send({ error: err.message });
  } else if (err instanceof EventNotFoundError) {
    reply.code(404).send({ error: "Event not found" });
  } else if (err instanceof EventEditForbiddenError) {
    if (err.code === "not_author") {
      reply.code(403).send({ error: "Forbidden: you are not the author of this event" });
    } else if (err.code === "not_editable_kind") {
      reply.code(403).send({ error: "Forbidden: only comments and journal entries can be edited or deleted" });
    } else {
      reply.code(403).send({ error: err.code === "subsequent_activity" ? "Cannot delete: subsequent activity exists on this task" : "Cannot edit or delete: edit window has expired", code: err.code });
    }
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
            space_id: { type: "string" },
          },
        },
      },
    },
    async (req) => {
      const actor = req.actor!;
      const q = req.query as { include_archived?: string; space_id?: string };
      const includeArchived = q.include_archived === "true";
      const conditions = [];
      if (!includeArchived) conditions.push(eq(tasks.archived, false));
      if (q.space_id) {
        conditions.push(eq(tasks.spaceId, q.space_id));
      } else if (actor.accessibleSpaceIds !== "all") {
        const ids = [...actor.accessibleSpaceIds];
        if (ids.length === 0) return [];
        conditions.push(inArray(tasks.spaceId, ids));
      }
      const where =
        conditions.length === 0
          ? undefined
          : conditions.length === 1
            ? conditions[0]
            : and(...conditions);
      const query = app.db.select().from(tasks).orderBy(asc(tasks.position));
      const rows = where ? query.where(where).all() : query.all();
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
      const row = loadTaskForActor(app.db, req.actor!, id, reply);
      if (!row) return;
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
            space_id: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const body = req.body as CreateTaskRequest;
      if (body.space_id && !canAccessSpace(actor, body.space_id)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      try {
        reply.code(201);
        return createTask(app.db, app.events, actor.id, body);
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
            space_id: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!;
      const { id } = req.params as { id: string };
      const existing = loadTaskForActor(app.db, actor, id, reply);
      if (!existing) return;
      const body = req.body as UpdateTaskRequest;
      if (body.space_id && body.space_id !== existing.spaceId && !canAccessSpace(actor, body.space_id)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      try {
        return updateTask(app.db, app.events, actor.id, id, body);
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
      const { id } = req.params as { id: string };
      if (!loadTaskForActor(app.db, req.actor!, id, reply)) return;
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
      const existing = loadTaskForActor(app.db, req.actor!, id, reply);
      if (!existing) return;
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
      const actor = req.actor!.id;
      const { id } = req.params as { id: string };
      if (!loadTaskForActor(app.db, req.actor!, id, reply)) return;
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
      const actor = req.actor!.id;
      const { id } = req.params as { id: string };
      if (!loadTaskForActor(app.db, req.actor!, id, reply)) return;
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
      const actor = req.actor!.id;
      const { id } = req.params as { id: string };
      if (!loadTaskForActor(app.db, req.actor!, id, reply)) return;
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
      const actor = req.actor!.id;
      const { id, blocker_id: blockerId } = req.params as {
        id: string;
        blocker_id: string;
      };
      if (!loadTaskForActor(app.db, req.actor!, id, reply)) return;
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
      const actor = req.actor!.id;
      const { id } = req.params as { id: string };
      if (!loadTaskForActor(app.db, req.actor!, id, reply)) return;
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
      const actor = req.actor!.id;
      const { id } = req.params as { id: string };
      if (!loadTaskForActor(app.db, req.actor!, id, reply)) return;
      try {
        reply.code(200);
        return unarchiveTask(app.db, app.events, actor, id);
      } catch (err) {
        mapServiceError(err, reply);
      }
    },
  );

  app.patch(
    "/api/tasks/:id/events/:event_id",
    {
      schema: {
        summary: "Edit a comment or journal entry",
        description:
          "Author-only. Updates the body of a comment or journal entry and sets `updated_at`. " +
          "Only allowed within the configured edit window (`KANBAN_EDIT_WINDOW_MINUTES`).",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
            event_id: { type: "string" },
          },
          required: ["id", "event_id"],
        },
        body: {
          type: "object",
          required: ["body"],
          properties: { body: { type: "string", minLength: 1, maxLength: 100000 } },
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!.id;
      const { id, event_id: eventId } = req.params as { id: string; event_id: string };
      if (!loadTaskForActor(app.db, req.actor!, id, reply)) return;
      const { body } = req.body as { body: string };
      try {
        return editTaskEvent(app.db, app.events, actor, id, eventId, body, app.config.editWindowMinutes);
      } catch (err) {
        mapServiceError(err, reply);
      }
    },
  );

  app.delete(
    "/api/tasks/:id/events/:event_id",
    {
      schema: {
        summary: "Delete a comment or journal entry",
        description:
          "Author-only. Deletes a comment or journal entry if both conditions are met: " +
          "(1) no subsequent activity exists on the task, and " +
          "(2) the entry is within the configured edit window (`KANBAN_EDIT_WINDOW_MINUTES`). " +
          "Returns 403 with `code: subsequent_activity` or `code: edit_window_expired` when the respective condition fails.",
        tags: ["tasks"],
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
            event_id: { type: "string" },
          },
          required: ["id", "event_id"],
        },
      },
    },
    async (req, reply) => {
      const actor = req.actor!.id;
      const { id, event_id: eventId } = req.params as { id: string; event_id: string };
      if (!loadTaskForActor(app.db, req.actor!, id, reply)) return;
      try {
        deleteTaskEvent(app.db, app.events, actor, id, eventId, app.config.editWindowMinutes);
        reply.code(204);
      } catch (err) {
        mapServiceError(err, reply);
      }
    },
  );
};
