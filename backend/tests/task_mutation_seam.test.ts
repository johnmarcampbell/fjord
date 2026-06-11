import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { DEFAULT_ADMINISTRATOR_ID, type StreamEvent } from "@fjord/shared";
import { openDatabase, runMigrations } from "../src/db/index.js";
import { EventBus } from "../src/event_bus.js";
import { taskDependencies, taskEvents, tasks } from "../src/db/schema.js";
import { seedDefaultAdministrator } from "../src/services/users.js";
import {
  VersionConflictError,
  addBlocker,
  addComment,
  addJournalEntry,
  archiveTask,
  createTask,
  deleteTask,
  deleteTaskEvent,
  editTaskEvent,
  removeBlocker,
  unarchiveTask,
  updateTask,
  type TaskCtx,
} from "../src/services/tasks.js";

const ADMIN = DEFAULT_ADMINISTRATOR_ID;

/**
 * These tests exercise the Task-mutation seam directly — no Fastify, no HTTP.
 * The invariant under test: a Task mutation's writes commit atomically, and
 * its Stream events reach the bus only after COMMIT (never on rollback).
 */
function makeCtx() {
  const handle = openDatabase(":memory:");
  runMigrations(handle);
  seedDefaultAdministrator(handle);
  const bus = new EventBus();
  const published: StreamEvent[] = [];
  bus.subscribe((e) => published.push(e));
  const ctx: TaskCtx = { db: handle.db, bus };
  return { ctx, published, close: handle.close };
}

describe("task mutation seam", () => {
  it("publishes stream events only after a successful mutation", () => {
    const { ctx, published, close } = makeCtx();
    try {
      const task = createTask(ctx, ADMIN, { title: "T" });
      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({ type: "task.created", task_id: task.id });

      const row = ctx.db.select().from(tasks).where(eq(tasks.id, task.id)).get();
      expect(row?.version).toBe(1);
      const events = ctx.db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).all();
      expect(events.map((e) => e.kind)).toEqual(["task_created"]);
    } finally {
      close();
    }
  });

  it("publishes nothing when a guard rejects the mutation", () => {
    const { ctx, published, close } = makeCtx();
    try {
      const task = createTask(ctx, ADMIN, { title: "T" });
      published.length = 0;

      expect(() =>
        updateTask(ctx, ADMIN, task.id, { version: 999, column: "To Do" }),
      ).toThrow(VersionConflictError);
      expect(published).toHaveLength(0);
    } finally {
      close();
    }
  });

  it("rolls back earlier writes when a later statement fails, and publishes nothing", () => {
    const { ctx, published, close } = makeCtx();
    try {
      const task = createTask(ctx, ADMIN, { title: "T" });
      published.length = 0;

      // "ghost" passes every guard (the acting user is never validated), so the
      // task-row UPDATE succeeds and the column_changed event INSERT then hits
      // the task_events.actor_id → users.id foreign key. Without the
      // transaction, the version bump and column change would survive the throw.
      expect(() =>
        updateTask(ctx, "ghost", task.id, { version: 1, column: "To Do" }),
      ).toThrow();

      const row = ctx.db.select().from(tasks).where(eq(tasks.id, task.id)).get();
      expect(row?.version).toBe(1);
      expect(row?.column).toBe("Backlog");
      const events = ctx.db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).all();
      expect(events.map((e) => e.kind)).toEqual(["task_created"]);
      expect(published).toHaveLength(0);
    } finally {
      close();
    }
  });

  it("commits before any of a multi-event mutation's stream events fire", () => {
    const { ctx, published, close } = makeCtx();
    try {
      const blocked = createTask(ctx, ADMIN, { title: "blocked" });
      const blocker = createTask(ctx, ADMIN, { title: "blocker" });
      published.length = 0;

      // Listener-eye view: when the first stream event arrives, the dependency
      // row must already be durable (publish happens strictly after COMMIT).
      const depVisibleAtPublish: boolean[] = [];
      ctx.bus.subscribe(() => {
        const dep = ctx.db
          .select()
          .from(taskDependencies)
          .where(eq(taskDependencies.blockedId, blocked.id))
          .get();
        depVisibleAtPublish.push(!!dep);
      });

      addBlocker(ctx, ADMIN, blocked.id, blocker.id);

      expect(published.map((e) => e.type)).toEqual(["task.event_added", "task.updated"]);
      expect(depVisibleAtPublish).toEqual([true, true]);
    } finally {
      close();
    }
  });

  it("publishes nothing when the task does not exist", () => {
    const { ctx, published, close } = makeCtx();
    try {
      expect(() => addComment(ctx, ADMIN, "no-such-task", "hi")).toThrow();
      expect(published).toHaveLength(0);
      expect(ctx.db.select().from(taskEvents).all()).toHaveLength(0);
    } finally {
      close();
    }
  });

  it("every mutation kind publishes its expected stream events, in order", () => {
    const { ctx, published, close } = makeCtx();
    try {
      const expectPublished = (...types: Array<StreamEvent["type"]>) => {
        expect(published.map((e) => e.type)).toEqual(types);
        published.length = 0;
      };

      const t = createTask(ctx, ADMIN, { title: "main" });
      expectPublished("task.created");
      const blocker = createTask(ctx, ADMIN, { title: "blocker" });
      expectPublished("task.created");

      updateTask(ctx, ADMIN, t.id, { version: t.version, column: "Done" });
      expectPublished("task.updated");

      const comment = addComment(ctx, ADMIN, t.id, "hello");
      expectPublished("task.event_added");

      editTaskEvent(ctx, ADMIN, t.id, comment.id, "edited", 5);
      expectPublished("task.event_updated");

      deleteTaskEvent(ctx, ADMIN, t.id, comment.id, 5);
      expectPublished("task.event_deleted");

      addJournalEntry(ctx, ADMIN, t.id, "note to self");
      expectPublished("task.event_added");

      addBlocker(ctx, ADMIN, t.id, blocker.id);
      expectPublished("task.event_added", "task.updated");

      removeBlocker(ctx, ADMIN, t.id, blocker.id);
      expectPublished("task.event_added", "task.updated");

      archiveTask(ctx, ADMIN, t.id);
      expectPublished("task.event_added", "task.updated");

      unarchiveTask(ctx, ADMIN, t.id);
      expectPublished("task.event_added", "task.updated");

      deleteTask(ctx, t.id);
      expectPublished("task.deleted");
    } finally {
      close();
    }
  });

  it("a throwing subscriber neither fails the mutation nor starves other subscribers", () => {
    const { ctx, published, close } = makeCtx();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // Subscribed after makeCtx's collector and before this test's collector:
      // both neighbours must still receive every event.
      ctx.bus.subscribe(() => {
        throw new Error("boom");
      });
      const after: StreamEvent[] = [];
      ctx.bus.subscribe((e) => after.push(e));

      const t = createTask(ctx, ADMIN, { title: "T" });
      const blocker = createTask(ctx, ADMIN, { title: "B" });
      addBlocker(ctx, ADMIN, t.id, blocker.id);

      expect(published.map((e) => e.type)).toEqual([
        "task.created",
        "task.created",
        "task.event_added",
        "task.updated",
      ]);
      expect(after).toEqual(published);
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
      close();
    }
  });
});
