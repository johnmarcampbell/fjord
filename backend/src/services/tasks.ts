import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Task, Column } from "@agentic-kanban/shared";
import type { DB } from "../db/index.js";
import { tasks, taskDependencies, taskEvents } from "../db/schema.js";

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return uuidv4();
}

export function hydrateTask(
  db: DB,
  row: typeof tasks.$inferSelect,
): Task {
  const blockedByRows = db
    .select({ id: taskDependencies.blockerId })
    .from(taskDependencies)
    .where(eq(taskDependencies.blockedId, row.id))
    .all();
  const blockingRows = db
    .select({ id: taskDependencies.blockedId })
    .from(taskDependencies)
    .where(eq(taskDependencies.blockerId, row.id))
    .all();
  const counts = db
    .select({
      commentCount: sql<number>`SUM(CASE WHEN ${taskEvents.kind} = 'comment' THEN 1 ELSE 0 END)`,
      journalCount: sql<number>`SUM(CASE WHEN ${taskEvents.kind} = 'journal_entry' THEN 1 ELSE 0 END)`,
    })
    .from(taskEvents)
    .where(eq(taskEvents.taskId, row.id))
    .get();
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    column: row.column as Column,
    position: row.position,
    reported_by: row.reportedBy,
    assigned_to: row.assignedTo,
    due_at: row.dueAt,
    project_id: row.projectId ?? null,
    tags: JSON.parse(row.tags) as string[],
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    version: row.version,
    archived: row.archived,
    archived_at: row.archivedAt ?? null,
    blocked_by: blockedByRows.map((r) => r.id),
    blocking: blockingRows.map((r) => r.id),
    comment_count: Number(counts?.commentCount ?? 0),
    journal_count: Number(counts?.journalCount ?? 0),
  };
}

/**
 * Returns true if `actorId` is the current assignee of task `taskId`.
 * Used to freeze the `by_assignee` flag on task_events rows at write time.
 */
export function isActorAssignee(db: DB, taskId: string, actorId: string): boolean {
  const row = db
    .select({ assignedTo: tasks.assignedTo })
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .get();
  if (!row) return false;
  return row.assignedTo === actorId;
}

export function columnHeadPosition(db: DB, column: Column): number {
  const row = db
    .select({ min: sql<number | null>`min(${tasks.position})` })
    .from(tasks)
    .where(eq(tasks.column, column))
    .get();
  const min = row?.min ?? null;
  return min === null ? 0 : min - 1;
}

export function columnTailPosition(db: DB, column: Column): number {
  const row = db
    .select({ max: sql<number | null>`max(${tasks.position})` })
    .from(tasks)
    .where(eq(tasks.column, column))
    .get();
  const max = row?.max ?? null;
  return max === null ? 0 : max + 1;
}

/**
 * Returns true if adding edge (blocker -> blocked) would create a cycle.
 * Walks the existing graph from `blocked` and checks whether `blocker` is reachable.
 */
export function wouldCreateCycle(
  db: DB,
  blockerId: string,
  blockedId: string,
): boolean {
  if (blockerId === blockedId) return true;
  const visited = new Set<string>();
  const stack: string[] = [blockedId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === blockerId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const successors = db
      .select({ id: taskDependencies.blockedId })
      .from(taskDependencies)
      .where(eq(taskDependencies.blockerId, current))
      .all();
    for (const s of successors) stack.push(s.id);
  }
  return false;
}
