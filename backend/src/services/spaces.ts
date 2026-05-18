import { eq, sql } from "drizzle-orm";
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

export function toSpace(row: typeof spaces.$inferSelect): Space {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    archived_at: row.archivedAt ?? null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function requireSpace(db: DB, spaceId: string): void {
  if (!db.select().from(spaces).where(eq(spaces.id, spaceId)).get())
    throw new UnknownSpaceError();
}

export function listSpaces(db: DB): Space[] {
  return db.select().from(spaces).all().map(toSpace);
}

export function getSpace(db: DB, id: string): Space {
  const row = db.select().from(spaces).where(eq(spaces.id, id)).get();
  if (!row) throw new SpaceNotFoundError();
  return toSpace(row);
}

export function createSpace(db: DB, body: CreateSpaceRequest): Space {
  const now = nowIso();
  const row = {
    id: newId(),
    name: body.name,
    description: body.description ?? "",
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
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

  const projectCount = db
    .select({ n: sql<number>`count(*)` })
    .from(projects)
    .where(eq(projects.spaceId, id))
    .get();
  if ((projectCount?.n ?? 0) > 0) throw new SpaceNotEmptyError();

  const taskCount = db
    .select({ n: sql<number>`count(*)` })
    .from(tasks)
    .where(eq(tasks.spaceId, id))
    .get();
  if ((taskCount?.n ?? 0) > 0) throw new SpaceNotEmptyError();

  db.delete(spaces).where(eq(spaces.id, id)).run();
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
  requireSpace(db, newSpaceId);
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
    events.publish({ type: "task.updated", task_id: t.id, version: t.version });
  }
}
