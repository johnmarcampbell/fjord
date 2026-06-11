import { describe, expect, it } from "vitest";
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
  createTask,
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
});
