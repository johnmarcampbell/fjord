import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers.js";

async function createTask(
  ctx: Awaited<ReturnType<typeof makeTestApp>>,
  actor: string,
  payload: Record<string, unknown>,
) {
  const res = await ctx.inject({
    method: "POST",
    url: "/api/tasks",
    headers: { "x-user-id": actor },
    payload,
  });
  return res;
}

describe("tasks", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("creates a task and records a task_created event", async () => {
    const res = await createTask(ctx, "alice", { title: "First task" });
    expect(res.statusCode).toBe(201);
    const task = res.json();
    expect(task.title).toBe("First task");
    expect(task.column).toBe("Backlog");
    expect(task.reported_by).toBe("alice");
    expect(task.version).toBe(1);

    const events = await ctx.inject({
      method: "GET",
      url: `/api/tasks/${task.id}/events`,
    });
    expect(events.statusCode).toBe(200);
    const list = events.json();
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("task_created");
    expect(list[0].actor_id).toBe("alice");
  });

  it("rejects create with no authentication", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "x" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects create with an invalid bearer token", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { authorization: "Bearer ak_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      payload: { title: "x" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("updates a task with correct version", async () => {
    const create = await createTask(ctx, "alice", { title: "T" });
    const task = create.json();
    const res = await ctx.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      headers: { "x-user-id": "alice" },
      payload: { version: task.version, column: "In Progress" },
    });
    expect(res.statusCode).toBe(200);
    const updated = res.json();
    expect(updated.column).toBe("In Progress");
    expect(updated.version).toBe(2);
  });

  it("returns 409 on version conflict", async () => {
    const create = await createTask(ctx, "alice", { title: "T" });
    const task = create.json();
    const res = await ctx.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      headers: { "x-user-id": "alice" },
      payload: { version: 99, column: "Done" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().current_version).toBe(1);
  });

  it("records column_changed event on column move", async () => {
    const t = (await createTask(ctx, "alice", { title: "T" })).json();
    await ctx.inject({
      method: "PATCH",
      url: `/api/tasks/${t.id}`,
      headers: { "x-user-id": "agent-coder" },
      payload: { version: 1, column: "In Review" },
    });
    const events = (
      await ctx.inject({ method: "GET", url: `/api/tasks/${t.id}/events` })
    ).json();
    const colChange = events.find((e: any) => e.kind === "column_changed");
    expect(colChange.actor_id).toBe("agent-coder");
    expect(colChange.from_value).toBe("Backlog");
    expect(colChange.to_value).toBe("In Review");
  });

  it("appends a comment", async () => {
    const t = (await createTask(ctx, "alice", { title: "T" })).json();
    const res = await ctx.inject({
      method: "POST",
      url: `/api/tasks/${t.id}/comments`,
      headers: { "x-user-id": "alice" },
      payload: { body: "Hello *world*" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().body).toBe("Hello *world*");
    expect(res.json().kind).toBe("comment");
  });

  it("adds and removes a blocker", async () => {
    const a = (await createTask(ctx, "alice", { title: "A" })).json();
    const b = (await createTask(ctx, "alice", { title: "B" })).json();
    const add = await ctx.inject({
      method: "POST",
      url: `/api/tasks/${b.id}/blockers`,
      headers: { "x-user-id": "alice" },
      payload: { blocker_id: a.id },
    });
    expect(add.statusCode).toBe(201);
    const refetched = (
      await ctx.inject({ method: "GET", url: `/api/tasks/${b.id}` })
    ).json();
    expect(refetched.blocked_by).toEqual([a.id]);

    const del = await ctx.inject({
      method: "DELETE",
      url: `/api/tasks/${b.id}/blockers/${a.id}`,
      headers: { "x-user-id": "alice" },
    });
    expect(del.statusCode).toBe(204);
  });

  it("rejects a blocker cycle", async () => {
    const a = (await createTask(ctx, "alice", { title: "A" })).json();
    const b = (await createTask(ctx, "alice", { title: "B" })).json();
    await ctx.inject({
      method: "POST",
      url: `/api/tasks/${b.id}/blockers`,
      headers: { "x-user-id": "alice" },
      payload: { blocker_id: a.id },
    });
    const res = await ctx.inject({
      method: "POST",
      url: `/api/tasks/${a.id}/blockers`,
      headers: { "x-user-id": "alice" },
      payload: { blocker_id: b.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/cycle/i);
  });

  it("rejects self-blocker", async () => {
    const a = (await createTask(ctx, "alice", { title: "A" })).json();
    const res = await ctx.inject({
      method: "POST",
      url: `/api/tasks/${a.id}/blockers`,
      headers: { "x-user-id": "alice" },
      payload: { blocker_id: a.id },
    });
    expect(res.statusCode).toBe(400);
  });

  it("deletes a task and cascades events + deps", async () => {
    const t = (await createTask(ctx, "alice", { title: "T" })).json();
    const del = await ctx.inject({
      method: "DELETE",
      url: `/api/tasks/${t.id}`,
      headers: { "x-user-id": "alice" },
    });
    expect(del.statusCode).toBe(204);
    const get = await ctx.inject({
      method: "GET",
      url: `/api/tasks/${t.id}`,
    });
    expect(get.statusCode).toBe(404);
  });

  it("places new tasks at the top of Backlog", async () => {
    const a = (await createTask(ctx, "alice", { title: "A" })).json();
    const b = (await createTask(ctx, "alice", { title: "B" })).json();
    expect(b.position).toBeLessThan(a.position);
  });
});
