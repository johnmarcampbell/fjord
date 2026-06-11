import { and, eq, gt, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  DEFAULT_SPACE_ID,
  canArchive,
  type Column,
  type CreateTaskRequest,
  type StreamEvent,
  type Task,
  type TaskEvent,
  type UpdateTaskRequest,
} from "@fjord/shared";
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

export function assertAssigneeCanAccessSpace(db: DB, assigneeId: string, destSpaceId: string): void {
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

/**
 * Build a `task_events` insert row with the common defaults: a fresh id and all
 * optional columns null. Callers override only the fields a given kind actually
 * uses — `body` for comments/journal entries, `fromValue`/`toValue` for change
 * events, `blockerId` for blocker events. `createdAt` defaults to now; pass it
 * explicitly to share a single timestamp with a sibling task-row write.
 *
 * `updatedAt` is always null here: events are immutable at creation. Only the
 * edit path (`editTaskEvent`) stamps `updatedAt`, and it updates the row directly.
 */
export function buildTaskEvent(args: {
  taskId: string;
  actorId: string;
  kind: TaskEvent["kind"];
  byAssignee: boolean;
  createdAt?: string;
  body?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  blockerId?: string | null;
}): typeof taskEvents.$inferSelect {
  return {
    id: newId(),
    taskId: args.taskId,
    actorId: args.actorId,
    kind: args.kind,
    createdAt: args.createdAt ?? nowIso(),
    updatedAt: null,
    body: args.body ?? null,
    fromValue: args.fromValue ?? null,
    toValue: args.toValue ?? null,
    blockerId: args.blockerId ?? null,
    byAssignee: args.byAssignee,
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

/** Fetch a task row by id or throw `TaskNotFoundError`. The shared preamble of
 * nearly every task mutation. */
function getTaskOrThrow(db: DB, id: string): typeof tasks.$inferSelect {
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!task) throw new TaskNotFoundError();
  return task;
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

/** Everything a Task mutation needs: the database and the bus to announce
 * committed changes on. Routes pass `{ db: app.db, bus: app.events }`. */
export interface TaskCtx {
  db: DB;
  bus: EventBus;
}

type PublishFn = (event: StreamEvent) => void;

/**
 * Run a Task mutation: the body's writes (task rows + task events) commit in a
 * single transaction, and the stream events it `publish`es are delivered to
 * the bus only after COMMIT — never before, never on rollback. Every exported
 * mutation in this file goes through here; there is no unguarded write path.
 *
 * The body's entire world is the two arguments it receives: the db and the
 * publish channel. SQLite transactions are connection-scoped, so every
 * statement issued on `db` inside the callback participates without
 * threading drizzle's `tx` through the helpers.
 */
function runTaskMutation<T>(ctx: TaskCtx, fn: (db: DB, publish: PublishFn) => T): T {
  const pending: StreamEvent[] = [];
  // Void-returning callback: drizzle's sync-driver types reject an unresolved
  // generic return (their async-callback guard), so the result rides a local.
  let result!: T;
  ctx.db.transaction(() => {
    result = fn(ctx.db, (event) => pending.push(event));
  });
  for (const event of pending) ctx.bus.publish(event);
  return result;
}

export function createTask(ctx: TaskCtx, actor: string, body: CreateTaskRequest): Task {
  return runTaskMutation(ctx, (db, publish) => {
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
      .values(
        buildTaskEvent({
          taskId: id,
          actorId: actor,
          kind: "task_created",
          byAssignee: row.assignedTo === actor,
          createdAt: now,
        }),
      )
      .run();
    publish({ type: "task.created", task_id: id, space_id: spaceId });
    return hydrateTask(db, { ...row });
  });
}

/**
 * Resolve the destination space for an update and enforce the cross-space-move
 * guards. A project-bound task's space follows its project; a project-less task
 * may move space directly. When the space actually changes, the destination must
 * be writeable and the resulting assignee must retain access. Returns the
 * resolved `spaceId`/`projectId` for the updates row.
 */
function resolveTargetSpace(
  db: DB,
  existing: typeof tasks.$inferSelect,
  body: UpdateTaskRequest,
): { spaceId: string; projectId: string | null } {
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

  return { spaceId: newSpaceId, projectId: newProjectId };
}

/**
 * Insert a `*_changed` task event for each field whose value differs between
 * `existing` and `updates`. `byAssignee` uses the post-update assignee so a
 * reassignment event reflects the resulting assignment.
 */
function emitChangeEvents(
  db: DB,
  actor: string,
  taskId: string,
  now: string,
  existing: typeof tasks.$inferSelect,
  updates: {
    column: Column;
    assignedTo: string | null;
    dueAt: string | null;
    projectId: string | null;
    spaceId: string;
    tags: string;
  },
): void {
  const eventRows: Array<typeof taskEvents.$inferInsert> = [];
  const byAssignee = updates.assignedTo === actor;
  const mkEvent = (
    kind: TaskEvent["kind"],
    fromValue: string | null,
    toValue: string | null,
  ) =>
    buildTaskEvent({ taskId, actorId: actor, kind, byAssignee, createdAt: now, fromValue, toValue });

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
}

export function updateTask(
  ctx: TaskCtx,
  actor: string,
  id: string,
  body: UpdateTaskRequest,
): Task {
  return runTaskMutation(ctx, (db, publish) => {
    const existing = getTaskOrThrow(db, id);
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

    const target = resolveTargetSpace(db, existing, body);

    const newTagsArr =
      body.tags !== undefined ? body.tags : (JSON.parse(existing.tags) as string[]);

    const updates = {
      title: body.title ?? existing.title,
      description: body.description ?? existing.description,
      column: nextColumn,
      position: nextPosition,
      assignedTo: body.assigned_to === undefined ? existing.assignedTo : body.assigned_to,
      dueAt: body.due_at === undefined ? existing.dueAt : body.due_at,
      projectId: target.projectId,
      spaceId: target.spaceId,
      tags: JSON.stringify(newTagsArr),
      updatedAt: now,
      version: existing.version + 1,
    };
    db.update(tasks).set(updates).where(eq(tasks.id, id)).run();

    emitChangeEvents(db, actor, id, now, existing, updates);

    publish({ type: "task.updated", task_id: id, version: updates.version, space_id: target.spaceId });
    return hydrateTask(db, { ...existing, ...updates });
  });
}

export function deleteTask(ctx: TaskCtx, id: string): void {
  runTaskMutation(ctx, (db, publish) => {
    const task = getTaskOrThrow(db, id);
    db.delete(tasks).where(eq(tasks.id, id)).run();
    publish({ type: "task.deleted", task_id: id, space_id: task.spaceId });
  });
}

/**
 * Append a free-text timeline entry. `comment` is cross-actor communication;
 * `journal_entry` is the assignee's durable working notes. They differ only by
 * kind, so both public entry points delegate here.
 */
function addTimelineEntry(
  db: DB,
  publish: PublishFn,
  actor: string,
  taskId: string,
  kind: "comment" | "journal_entry",
  body: string,
): TaskEvent {
  const existing = getTaskOrThrow(db, taskId);
  const event = buildTaskEvent({
    taskId,
    actorId: actor,
    kind,
    byAssignee: existing.assignedTo === actor,
    body,
  });
  db.insert(taskEvents).values(event).run();
  publish({
    type: "task.event_added",
    task_id: taskId,
    event_id: event.id,
    kind,
    space_id: existing.spaceId,
  });
  return toEvent(event);
}

export function addComment(
  ctx: TaskCtx,
  actor: string,
  taskId: string,
  body: string,
): TaskEvent {
  return runTaskMutation(ctx, (db, publish) =>
    addTimelineEntry(db, publish, actor, taskId, "comment", body),
  );
}

export function addJournalEntry(
  ctx: TaskCtx,
  actor: string,
  taskId: string,
  body: string,
): TaskEvent {
  return runTaskMutation(ctx, (db, publish) =>
    addTimelineEntry(db, publish, actor, taskId, "journal_entry", body),
  );
}

export function addBlocker(
  ctx: TaskCtx,
  actor: string,
  taskId: string,
  blockerId: string,
): Task {
  return runTaskMutation(ctx, (db, publish) => {
    const blocked = getTaskOrThrow(db, taskId);
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
    const event = buildTaskEvent({
      taskId,
      actorId: actor,
      kind: "blocker_added",
      byAssignee: blocked.assignedTo === actor,
      blockerId,
    });
    db.insert(taskEvents).values(event).run();
    publish({
      type: "task.event_added",
      task_id: taskId,
      event_id: event.id,
      kind: "blocker_added",
      space_id: blocked.spaceId,
    });
    publish({ type: "task.updated", task_id: taskId, version: blocked.version, space_id: blocked.spaceId });
    return hydrateTask(db, blocked);
  });
}

export function removeBlocker(
  ctx: TaskCtx,
  actor: string,
  taskId: string,
  blockerId: string,
): void {
  runTaskMutation(ctx, (db, publish) => {
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

    // The dependency row's FK guarantees the task exists.
    const task = getTaskOrThrow(db, taskId);
    const event = buildTaskEvent({
      taskId,
      actorId: actor,
      kind: "blocker_removed",
      byAssignee: task.assignedTo === actor,
      blockerId,
    });
    db.insert(taskEvents).values(event).run();
    publish({
      type: "task.event_added",
      task_id: taskId,
      event_id: event.id,
      kind: "blocker_removed",
      space_id: task.spaceId,
    });
    publish({ type: "task.updated", task_id: taskId, version: task.version, space_id: task.spaceId });
  });
}

/**
 * Archive or unarchive a task. The two directions differ only in the state
 * guard, the row flags, and the event kind; everything else (version bump,
 * event row, dual publish, re-hydration) is shared.
 */
function setArchived(
  db: DB,
  publish: PublishFn,
  actor: string,
  taskId: string,
  archived: boolean,
): Task {
  const task = getTaskOrThrow(db, taskId);
  if (archived) {
    if (!canArchive({ column: task.column as Column, archived: task.archived })) {
      throw new TaskStateError("Can only archive tasks in Done column");
    }
  } else if (!task.archived) {
    throw new TaskStateError("Task is not archived");
  }

  const now = nowIso();
  const changes = {
    archived,
    archivedAt: archived ? now : null,
    version: task.version + 1,
    updatedAt: now,
  };
  db.update(tasks).set(changes).where(eq(tasks.id, taskId)).run();
  const event = buildTaskEvent({
    taskId,
    actorId: actor,
    kind: archived ? "task_archived" : "task_unarchived",
    byAssignee: task.assignedTo === actor,
    createdAt: now,
  });
  db.insert(taskEvents).values(event).run();
  publish({
    type: "task.event_added",
    task_id: taskId,
    event_id: event.id,
    kind: archived ? "task_archived" : "task_unarchived",
    space_id: task.spaceId,
  });
  publish({ type: "task.updated", task_id: taskId, version: changes.version, space_id: task.spaceId });
  return hydrateTask(db, { ...task, ...changes });
}

export function archiveTask(ctx: TaskCtx, actor: string, taskId: string): Task {
  return runTaskMutation(ctx, (db, publish) => setArchived(db, publish, actor, taskId, true));
}

export function unarchiveTask(ctx: TaskCtx, actor: string, taskId: string): Task {
  return runTaskMutation(ctx, (db, publish) => setArchived(db, publish, actor, taskId, false));
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

  // Half-open window: editable iff elapsed < windowMs. Using `>=` (not `>`) makes
  // `editWindowMinutes: 0` mean "no edits at all" rather than "only within the same
  // millisecond as creation" — the latter is racy (creation and edit can land in the
  // same ms on a fast machine). For non-zero windows this only differs at the exact
  // millisecond boundary, which is unobservable in practice.
  const windowMs = editWindowMinutes * 60 * 1000;
  const createdMs = new Date(event.createdAt).getTime();
  if (Date.now() - createdMs >= windowMs) throw new EventEditForbiddenError("edit_window_expired");
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
  ctx: TaskCtx,
  actor: string,
  taskId: string,
  eventId: string,
  body: string,
  editWindowMinutes: number,
): TaskEvent {
  return runTaskMutation(ctx, (db, publish) => {
    const task = getTaskOrThrow(db, taskId);
    const event = db.select().from(taskEvents).where(eq(taskEvents.id, eventId)).get();
    if (!event || event.taskId !== taskId) throw new EventNotFoundError();

    checkEventEditability(db, event, actor, editWindowMinutes);

    const now = nowIso();
    db.update(taskEvents).set({ body, updatedAt: now }).where(eq(taskEvents.id, eventId)).run();
    publish({ type: "task.event_updated", task_id: taskId, event_id: eventId, space_id: task.spaceId });

    return toEvent({ ...event, body, updatedAt: now });
  });
}

export function deleteTaskEvent(
  ctx: TaskCtx,
  actor: string,
  taskId: string,
  eventId: string,
  editWindowMinutes: number,
): void {
  runTaskMutation(ctx, (db, publish) => {
    const task = getTaskOrThrow(db, taskId);
    const event = db.select().from(taskEvents).where(eq(taskEvents.id, eventId)).get();
    if (!event || event.taskId !== taskId) throw new EventNotFoundError();

    checkEventEditability(db, event, actor, editWindowMinutes);

    if (hasSubsequentActivity(db, taskId, event.createdAt)) {
      throw new EventEditForbiddenError("subsequent_activity");
    }

    db.delete(taskEvents).where(eq(taskEvents.id, eventId)).run();
    publish({ type: "task.event_deleted", task_id: taskId, event_id: eventId, space_id: task.spaceId });
  });
}
