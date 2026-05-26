import { and, eq, gt, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  DEFAULT_SPACE_ID,
  canArchive,
  type Column,
  type CreateTaskRequest,
  type Task,
  type TaskEvent,
  type UpdateTaskRequest,
} from "@agentic-kanban/shared";
import type { DB } from "../db/index.js";
import type { EventBus } from "../event_bus.js";
import { spaces, taskDependencies, taskEvents, tasks, userSpaceAccess, users, projects } from "../db/schema.js";
import { assertSpaceWriteable } from "./spaces.js";

// ── Errors ────────────────────────────────────────────────────────────────────

export class TaskNotFoundError extends Error {
  readonly name = "TaskNotFoundError";
}

export class VersionConflictError extends Error {
  readonly name = "VersionConflictError";
  constructor(public readonly currentVersion: number) {
    super();
  }
}

export class UnknownUserError extends Error {
  readonly name = "UnknownUserError";
}

export class UnknownProjectError extends Error {
  readonly name = "UnknownProjectError";
}

export class SpaceProjectMismatchError extends Error {
  readonly name = "SpaceProjectMismatchError";
}

export class BlockerNotFoundError extends Error {
  readonly name = "BlockerNotFoundError";
}

export class DuplicateDependencyError extends Error {
  readonly name = "DuplicateDependencyError";
}

export class CycleError extends Error {
  readonly name = "CycleError";
}

export class DependencyNotFoundError extends Error {
  readonly name = "DependencyNotFoundError";
}

export class TaskStateError extends Error {
  readonly name = "TaskStateError";
  constructor(message: string) {
    super(message);
  }
}

export class AssigneeNoAccessError extends Error {
  readonly name = "AssigneeNoAccessError";
  constructor(message: string) {
    super(message);
  }
}

export class EventNotFoundError extends Error {
  readonly name = "EventNotFoundError";
}

export class EventEditForbiddenError extends Error {
  readonly name = "EventEditForbiddenError";
  constructor(public readonly code: "subsequent_activity" | "edit_window_expired" | "not_author" | "not_editable_kind") {
    super(code);
  }
}

/**
 * True if the given user can access the given space (Admin, Owner, or has an
 * explicit grant). Used by cross-space-move guards to reject moves that would
 * orphan an assignee.
 */
export function userCanAccessSpace(db: DB, userId: string, spaceId: string): boolean {
  const user = db.select({ role: users.role }).from(users).where(eq(users.id, userId)).get();
  if (!user) return false;
  // Admins are NOT implicitly eligible for every space — affiliation (owner or explicit
  // grant) is required for assignee eligibility, matching the explicit-membership model.
  const owns = db
    .select({ id: spaces.id })
    .from(spaces)
    .where(and(eq(spaces.id, spaceId), eq(spaces.createdBy, userId)))
    .get();
  if (owns) return true;
  const grant = db
    .select({ userId: userSpaceAccess.userId })
    .from(userSpaceAccess)
    .where(and(eq(userSpaceAccess.userId, userId), eq(userSpaceAccess.spaceId, spaceId)))
    .get();
  return !!grant;
}

function assertAssigneeCanAccessSpace(db: DB, assigneeId: string, destSpaceId: string): void {
  if (userCanAccessSpace(db, assigneeId, destSpaceId)) return;
  const u = db
    .select({ handle: users.handle })
    .from(users)
    .where(eq(users.id, assigneeId))
    .get();
  const handle = u?.handle ?? assigneeId;
  throw new AssigneeNoAccessError(
    `Assignee ${handle} does not have access to destination space. Reassign or grant access first.`,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(): string {
  return uuidv4();
}

export function toEvent(row: typeof taskEvents.$inferSelect): TaskEvent {
  return {
    id: row.id,
    task_id: row.taskId,
    actor_id: row.actorId,
    kind: row.kind as TaskEvent["kind"],
    created_at: row.createdAt,
    updated_at: row.updatedAt ?? null,
    body: row.body,
    from_value: row.fromValue,
    to_value: row.toValue,
    blocker_id: row.blockerId,
    by_assignee: row.byAssignee,
  };
}

export function hydrateTask(db: DB, row: typeof tasks.$inferSelect): Task {
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
    space_id: row.spaceId,
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

export function requireUser(db: DB, userId: string): void {
  if (!db.select().from(users).where(eq(users.id, userId)).get()) throw new UnknownUserError();
}

export function requireProject(db: DB, projectId: string): void {
  if (!db.select().from(projects).where(eq(projects.id, projectId)).get())
    throw new UnknownProjectError();
}

function getProjectSpace(db: DB, projectId: string): string {
  const row = db
    .select({ spaceId: projects.spaceId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .get();
  if (!row) throw new UnknownProjectError();
  return row.spaceId;
}

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
export function wouldCreateCycle(db: DB, blockerId: string, blockedId: string): boolean {
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

// ── Mutations ─────────────────────────────────────────────────────────────────

export function createTask(
  db: DB,
  events: EventBus,
  actor: string,
  body: CreateTaskRequest,
): Task {
  const column = (body.column ?? "Backlog") as Column;

  if (body.assigned_to) requireUser(db, body.assigned_to);
  if (body.project_id) requireProject(db, body.project_id);

  let spaceId: string;
  if (body.project_id) {
    spaceId = getProjectSpace(db, body.project_id);
    if (body.space_id && body.space_id !== spaceId) throw new SpaceProjectMismatchError();
  } else if (body.space_id) {
    spaceId = body.space_id;
  } else {
    spaceId = DEFAULT_SPACE_ID;
  }
  assertSpaceWriteable(db, spaceId);

  const id = newId();
  const now = nowIso();
  const position = columnHeadPosition(db, column);
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
    spaceId,
  };
  db.insert(tasks).values(row).run();
  db.insert(taskEvents)
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
      byAssignee: row.assignedTo === actor,
    })
    .run();
  events.publish({ type: "task.created", task_id: id, space_id: spaceId });
  return hydrateTask(db, { ...row });
}

export function updateTask(
  db: DB,
  events: EventBus,
  actor: string,
  id: string,
  body: UpdateTaskRequest,
): Task {
  const existing = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!existing) throw new TaskNotFoundError();
  if (existing.version !== body.version) throw new VersionConflictError(existing.version);

  if (body.assigned_to != null) requireUser(db, body.assigned_to);
  if (body.project_id != null) requireProject(db, body.project_id);

  const now = nowIso();
  const nextColumn = (body.column ?? existing.column) as Column;
  let nextPosition = existing.position;
  if (body.position !== undefined) {
    nextPosition = body.position;
  } else if (body.column && body.column !== existing.column) {
    nextPosition = columnTailPosition(db, nextColumn);
  }

  const newProjectId = body.project_id === undefined ? existing.projectId : body.project_id;
  const projectIdChanging = body.project_id !== undefined && body.project_id !== existing.projectId;

  let newSpaceId: string;
  if (newProjectId) {
    // Project-bound task: space follows the project.
    newSpaceId = getProjectSpace(db, newProjectId);
    if (body.space_id && body.space_id !== newSpaceId) throw new SpaceProjectMismatchError();
  } else if (body.space_id !== undefined) {
    if (!projectIdChanging && existing.projectId) {
      // Direct space change on a project-bound task without clearing the project.
      throw new SpaceProjectMismatchError();
    }
    newSpaceId = body.space_id;
  } else {
    newSpaceId = existing.spaceId;
  }
  if (newSpaceId !== existing.spaceId) {
    assertSpaceWriteable(db, newSpaceId);
    const nextAssignee =
      body.assigned_to === undefined ? existing.assignedTo : body.assigned_to;
    if (nextAssignee) assertAssigneeCanAccessSpace(db, nextAssignee, newSpaceId);
  }

  const newTagsArr =
    body.tags !== undefined ? body.tags : (JSON.parse(existing.tags) as string[]);
  const newTagsStr = JSON.stringify(newTagsArr);

  const updates = {
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    column: nextColumn,
    position: nextPosition,
    assignedTo: body.assigned_to === undefined ? existing.assignedTo : body.assigned_to,
    dueAt: body.due_at === undefined ? existing.dueAt : body.due_at,
    projectId: newProjectId,
    spaceId: newSpaceId,
    tags: newTagsStr,
    updatedAt: now,
    version: existing.version + 1,
  };
  db.update(tasks).set(updates).where(eq(tasks.id, id)).run();

  const eventRows: Array<typeof taskEvents.$inferInsert> = [];
  // Use post-update assignee for byAssignee so a reassignment event reflects the resulting assignment.
  const eventByAssignee = updates.assignedTo === actor;
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
    byAssignee: eventByAssignee,
  });

  if (updates.column !== existing.column)
    eventRows.push(mkEvent("column_changed", existing.column, updates.column));
  if (updates.assignedTo !== existing.assignedTo)
    eventRows.push(mkEvent("assigned_to_changed", existing.assignedTo, updates.assignedTo));
  if (updates.dueAt !== existing.dueAt)
    eventRows.push(mkEvent("due_date_changed", existing.dueAt, updates.dueAt));
  if (updates.projectId !== existing.projectId)
    eventRows.push(mkEvent("project_changed", existing.projectId, updates.projectId));
  if (updates.spaceId !== existing.spaceId)
    eventRows.push(mkEvent("space_changed", existing.spaceId, updates.spaceId));
  if (updates.tags !== existing.tags)
    eventRows.push(mkEvent("tags_changed", existing.tags, updates.tags));

  if (eventRows.length) db.insert(taskEvents).values(eventRows).run();

  events.publish({ type: "task.updated", task_id: id, version: updates.version, space_id: newSpaceId });
  const newRow = db.select().from(tasks).where(eq(tasks.id, id)).get()!;
  return hydrateTask(db, newRow);
}

export function deleteTask(db: DB, events: EventBus, id: string): void {
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!task) throw new TaskNotFoundError();
  db.delete(tasks).where(eq(tasks.id, id)).run();
  events.publish({ type: "task.deleted", task_id: id, space_id: task.spaceId });
}

export function addComment(
  db: DB,
  events: EventBus,
  actor: string,
  taskId: string,
  body: string,
): TaskEvent {
  const existing = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!existing) throw new TaskNotFoundError();
  const eventId = newId();
  const row = {
    id: eventId,
    taskId,
    actorId: actor,
    kind: "comment" as const,
    createdAt: nowIso(),
    updatedAt: null,
    body,
    fromValue: null,
    toValue: null,
    blockerId: null,
    byAssignee: existing.assignedTo === actor,
  };
  db.insert(taskEvents).values(row).run();
  events.publish({ type: "task.event_added", task_id: taskId, event_id: eventId, kind: "comment", space_id: existing.spaceId });
  return toEvent(row);
}

export function addJournalEntry(
  db: DB,
  events: EventBus,
  actor: string,
  taskId: string,
  body: string,
): TaskEvent {
  const existing = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!existing) throw new TaskNotFoundError();
  const eventId = newId();
  const row = {
    id: eventId,
    taskId,
    actorId: actor,
    kind: "journal_entry" as const,
    createdAt: nowIso(),
    updatedAt: null,
    body,
    fromValue: null,
    toValue: null,
    blockerId: null,
    byAssignee: existing.assignedTo === actor,
  };
  db.insert(taskEvents).values(row).run();
  events.publish({
    type: "task.event_added",
    task_id: taskId,
    event_id: eventId,
    kind: "journal_entry",
    space_id: existing.spaceId,
  });
  return toEvent(row);
}

export function addBlocker(
  db: DB,
  events: EventBus,
  actor: string,
  taskId: string,
  blockerId: string,
): Task {
  const blocked = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!blocked) throw new TaskNotFoundError();
  if (!db.select().from(tasks).where(eq(tasks.id, blockerId)).get()) throw new BlockerNotFoundError();
  if (wouldCreateCycle(db, blockerId, taskId)) throw new CycleError();

  const existingDep = db
    .select()
    .from(taskDependencies)
    .where(
      and(eq(taskDependencies.blockerId, blockerId), eq(taskDependencies.blockedId, taskId)),
    )
    .get();
  if (existingDep) throw new DuplicateDependencyError();

  db.insert(taskDependencies).values({ blockerId, blockedId: taskId }).run();
  const eventId = newId();
  db.insert(taskEvents)
    .values({
      id: eventId,
      taskId,
      actorId: actor,
      kind: "blocker_added",
      createdAt: nowIso(),
      body: null,
      fromValue: null,
      toValue: null,
      blockerId,
      byAssignee: blocked.assignedTo === actor,
    })
    .run();
  events.publish({
    type: "task.event_added",
    task_id: taskId,
    event_id: eventId,
    kind: "blocker_added",
    space_id: blocked.spaceId,
  });
  events.publish({ type: "task.updated", task_id: taskId, version: blocked.version, space_id: blocked.spaceId });
  return hydrateTask(db, blocked);
}

export function removeBlocker(
  db: DB,
  events: EventBus,
  actor: string,
  taskId: string,
  blockerId: string,
): void {
  const dep = db
    .select()
    .from(taskDependencies)
    .where(
      and(eq(taskDependencies.blockerId, blockerId), eq(taskDependencies.blockedId, taskId)),
    )
    .get();
  if (!dep) throw new DependencyNotFoundError();

  db.delete(taskDependencies)
    .where(
      and(eq(taskDependencies.blockerId, blockerId), eq(taskDependencies.blockedId, taskId)),
    )
    .run();

  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  const eventId = newId();
  db.insert(taskEvents)
    .values({
      id: eventId,
      taskId,
      actorId: actor,
      kind: "blocker_removed",
      createdAt: nowIso(),
      body: null,
      fromValue: null,
      toValue: null,
      blockerId,
      byAssignee: task?.assignedTo === actor,
    })
    .run();
  events.publish({
    type: "task.event_added",
    task_id: taskId,
    event_id: eventId,
    kind: "blocker_removed",
    space_id: task?.spaceId ?? "",
  });
  events.publish({ type: "task.updated", task_id: taskId, version: task?.version ?? 0, space_id: task?.spaceId ?? "" });
}

export function archiveTask(db: DB, events: EventBus, actor: string, taskId: string): Task {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new TaskNotFoundError();
  if (!canArchive({ column: task.column as Column, archived: task.archived })) {
    throw new TaskStateError("Can only archive tasks in Done column");
  }

  const now = nowIso();
  const nextVersion = task.version + 1;
  db.update(tasks)
    .set({ archived: true, archivedAt: now, version: nextVersion, updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run();
  const eventId = newId();
  db.insert(taskEvents)
    .values({
      id: eventId,
      taskId,
      actorId: actor,
      kind: "task_archived",
      createdAt: now,
      body: null,
      fromValue: null,
      toValue: null,
      blockerId: null,
      byAssignee: task.assignedTo === actor,
    })
    .run();
  events.publish({
    type: "task.event_added",
    task_id: taskId,
    event_id: eventId,
    kind: "task_archived",
    space_id: task.spaceId,
  });
  events.publish({ type: "task.updated", task_id: taskId, version: nextVersion, space_id: task.spaceId });
  return hydrateTask(db, db.select().from(tasks).where(eq(tasks.id, taskId)).get()!);
}

export function unarchiveTask(db: DB, events: EventBus, actor: string, taskId: string): Task {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new TaskNotFoundError();
  if (!task.archived) throw new TaskStateError("Task is not archived");

  const now = nowIso();
  const nextVersion = task.version + 1;
  db.update(tasks)
    .set({ archived: false, archivedAt: null, version: nextVersion, updatedAt: now })
    .where(eq(tasks.id, taskId))
    .run();
  const eventId = newId();
  db.insert(taskEvents)
    .values({
      id: eventId,
      taskId,
      actorId: actor,
      kind: "task_unarchived",
      createdAt: now,
      body: null,
      fromValue: null,
      toValue: null,
      blockerId: null,
      byAssignee: task.assignedTo === actor,
    })
    .run();
  events.publish({
    type: "task.event_added",
    task_id: taskId,
    event_id: eventId,
    kind: "task_unarchived",
    space_id: task.spaceId,
  });
  events.publish({ type: "task.updated", task_id: taskId, version: nextVersion, space_id: task.spaceId });
  return hydrateTask(db, db.select().from(tasks).where(eq(tasks.id, taskId)).get()!);
}

const EDITABLE_KINDS = new Set(["comment", "journal_entry"]);

function checkEventEditability(
  _db: DB,
  event: typeof taskEvents.$inferSelect,
  actor: string,
  editWindowMinutes: number,
): void {
  if (!EDITABLE_KINDS.has(event.kind)) throw new EventEditForbiddenError("not_editable_kind");
  if (event.actorId !== actor) throw new EventEditForbiddenError("not_author");

  const windowMs = editWindowMinutes * 60 * 1000;
  const createdMs = new Date(event.createdAt).getTime();
  if (Date.now() - createdMs > windowMs) throw new EventEditForbiddenError("edit_window_expired");
}

function hasSubsequentActivity(db: DB, taskId: string, afterIso: string): boolean {
  const row = db
    .select({ id: taskEvents.id })
    .from(taskEvents)
    .where(and(eq(taskEvents.taskId, taskId), gt(taskEvents.createdAt, afterIso)))
    .get();
  return !!row;
}

export function editTaskEvent(
  db: DB,
  bus: EventBus,
  actor: string,
  taskId: string,
  eventId: string,
  body: string,
  editWindowMinutes: number,
): TaskEvent {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new TaskNotFoundError();
  const event = db.select().from(taskEvents).where(eq(taskEvents.id, eventId)).get();
  if (!event || event.taskId !== taskId) throw new EventNotFoundError();

  checkEventEditability(db, event, actor, editWindowMinutes);

  const now = nowIso();
  db.update(taskEvents).set({ body, updatedAt: now }).where(eq(taskEvents.id, eventId)).run();
  bus.publish({ type: "task.event_updated", task_id: taskId, event_id: eventId, space_id: task.spaceId });

  return toEvent({ ...event, body, updatedAt: now });
}

export function deleteTaskEvent(
  db: DB,
  bus: EventBus,
  actor: string,
  taskId: string,
  eventId: string,
  editWindowMinutes: number,
): void {
  const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
  if (!task) throw new TaskNotFoundError();
  const event = db.select().from(taskEvents).where(eq(taskEvents.id, eventId)).get();
  if (!event || event.taskId !== taskId) throw new EventNotFoundError();

  checkEventEditability(db, event, actor, editWindowMinutes);

  if (hasSubsequentActivity(db, taskId, event.createdAt)) {
    throw new EventEditForbiddenError("subsequent_activity");
  }

  db.delete(taskEvents).where(eq(taskEvents.id, eventId)).run();
  bus.publish({ type: "task.event_deleted", task_id: taskId, event_id: eventId, space_id: task.spaceId });
}
