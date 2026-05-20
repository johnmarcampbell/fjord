import { and, eq, isNull, sql } from "drizzle-orm";
import {
  DEFAULT_SPACE_ID,
  type CreateSpaceRequest,
  type Space,
  type UpdateSpaceRequest,
} from "@agentic-kanban/shared";
import type { DB } from "../db/index.js";
import type { EventBus } from "../event_bus.js";
import { projects, spaces, taskEvents, tasks } from "../db/schema.js";
import { newId, nowIso } from "./tasks.js";

export class SpaceNotFoundError extends Error {
  readonly name = "SpaceNotFoundError";
}

export class SpaceNotEmptyError extends Error {
  readonly name = "SpaceNotEmptyError";
}

export class CannotDeleteDefaultSpaceError extends Error {
  readonly name = "CannotDeleteDefaultSpaceError";
}

export class UnknownSpaceError extends Error {
  readonly name = "UnknownSpaceError";
}

export class SpaceArchiveBlockedError extends Error {
  readonly name = "SpaceArchiveBlockedError";
}

export class SpaceArchivedError extends Error {
  readonly name = "SpaceArchivedError";
}

export function toSpace(row: typeof spaces.$inferSelect): Space {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    archived_at: row.archivedAt ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    created_by: row.createdBy,
  };
}

export function requireSpace(db: DB, spaceId: string): void {
  if (!db.select().from(spaces).where(eq(spaces.id, spaceId)).get())
    throw new UnknownSpaceError();
}

/**
 * Validate that the given space exists and is not archived — i.e. it's a valid
 * target for creating new tasks/projects or moving a project into it. Throws
 * UnknownSpaceError or SpaceArchivedError.
 */
export function assertSpaceWriteable(db: DB, spaceId: string): void {
  const row = db
    .select({ archivedAt: spaces.archivedAt })
    .from(spaces)
    .where(eq(spaces.id, spaceId))
    .get();
  if (!row) throw new UnknownSpaceError();
  if (row.archivedAt !== null) throw new SpaceArchivedError();
}

export function listSpaces(db: DB, opts: { includeArchived?: boolean } = {}): Space[] {
  const query = db.select().from(spaces);
  const rows = opts.includeArchived ? query.all() : query.where(isNull(spaces.archivedAt)).all();
  return rows.map(toSpace);
}

export function getSpace(db: DB, id: string): Space {
  const row = db.select().from(spaces).where(eq(spaces.id, id)).get();
  if (!row) throw new SpaceNotFoundError();
  return toSpace(row);
}

export function createSpace(db: DB, body: CreateSpaceRequest, actorId: string): Space {
  const now = nowIso();
  const row = {
    id: newId(),
    name: body.name,
    description: body.description ?? "",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    createdBy: actorId,
  };
  db.insert(spaces).values(row).run();
  return toSpace(row);
}

export function updateSpace(db: DB, id: string, body: UpdateSpaceRequest): Space {
  const existing = db.select().from(spaces).where(eq(spaces.id, id)).get();
  if (!existing) throw new SpaceNotFoundError();

  const updates = {
    name: body.name ?? existing.name,
    description: body.description ?? existing.description,
    updatedAt: nowIso(),
  };
  db.update(spaces).set(updates).where(eq(spaces.id, id)).run();
  return toSpace({ ...existing, ...updates });
}

export function deleteSpace(db: DB, id: string): void {
  if (id === DEFAULT_SPACE_ID) throw new CannotDeleteDefaultSpaceError();
  const existing = db.select().from(spaces).where(eq(spaces.id, id)).get();
  if (!existing) throw new SpaceNotFoundError();

  // No tasks → safe to delete. Projects in the space are necessarily empty
  // (a task would have inherited the project's space), so we cascade them.
  const taskCount = db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.spaceId, id))
    .get();
  if ((taskCount?.n ?? 0) > 0) throw new SpaceNotEmptyError();

  db.transaction((tx) => {
    tx.delete(projects).where(eq(projects.spaceId, id)).run();
    tx.delete(spaces).where(eq(spaces.id, id)).run();
  });
}

export function archiveSpace(db: DB, id: string): Space {
  const existing = db.select().from(spaces).where(eq(spaces.id, id)).get();
  if (!existing) throw new SpaceNotFoundError();
  if (existing.archivedAt !== null) return toSpace(existing);

  const liveTasks = db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(and(eq(tasks.spaceId, id), eq(tasks.archived, false)))
    .get();
  if ((liveTasks?.n ?? 0) > 0) throw new SpaceArchiveBlockedError();

  const now = nowIso();
  db.update(spaces).set({ archivedAt: now, updatedAt: now }).where(eq(spaces.id, id)).run();
  return toSpace({ ...existing, archivedAt: now, updatedAt: now });
}

export function unarchiveSpace(db: DB, id: string): Space {
  const existing = db.select().from(spaces).where(eq(spaces.id, id)).get();
  if (!existing) throw new SpaceNotFoundError();
  if (existing.archivedAt === null) return toSpace(existing);

  const now = nowIso();
  db.update(spaces).set({ archivedAt: null, updatedAt: now }).where(eq(spaces.id, id)).run();
  return toSpace({ ...existing, archivedAt: null, updatedAt: now });
}

/**
 * Move a project to a different space, dragging its tasks along. Bumps each
 * affected task's version and records a space_changed event per task so
 * optimistic-concurrency clients notice the change.
 */
export function moveProjectToSpace(
  db: DB,
  events: EventBus,
  actor: string,
  projectId: string,
  newSpaceId: string,
): void {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project) throw new Error("Project not found");
  assertSpaceWriteable(db, newSpaceId);
  if (project.spaceId === newSpaceId) return;

  const oldSpaceId = project.spaceId;
  const now = nowIso();

  const affected = db.transaction((tx) => {
    tx.update(projects).set({ spaceId: newSpaceId }).where(eq(projects.id, projectId)).run();

    const affectedTasks = tx
      .select({ id: tasks.id, version: tasks.version, assignedTo: tasks.assignedTo })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .all();

    for (const t of affectedTasks) {
      tx.update(tasks)
        .set({ spaceId: newSpaceId, version: t.version + 1, updatedAt: now })
        .where(eq(tasks.id, t.id))
        .run();
      tx.insert(taskEvents)
        .values({
          id: newId(),
          taskId: t.id,
          actorId: actor,
          kind: "space_changed",
          createdAt: now,
          body: null,
          fromValue: oldSpaceId,
          toValue: newSpaceId,
          blockerId: null,
          byAssignee: t.assignedTo === actor,
        })
        .run();
    }

    return affectedTasks.map((t) => ({ id: t.id, version: t.version + 1 }));
  });

  for (const t of affected) {
    events.publish({ type: "task.updated", task_id: t.id, version: t.version, space_id: newSpaceId });
  }
}
