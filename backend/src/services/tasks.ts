import { eq, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import type { Task, Column } from "@agentic-kanban/shared";
import type { DB } from "../db/index.js";
import { tasks, taskDependencies } from "../db/schema.js";

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
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    column: row.column as Column,
    position: row.position,
    reported_by: row.reportedBy,
    assigned_to: row.assignedTo,
    due_at: row.dueAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    version: row.version,
    blocked_by: blockedByRows.map((r) => r.id),
    blocking: blockingRows.map((r) => r.id),
  };
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
