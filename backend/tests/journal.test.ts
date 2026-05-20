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
  return res.json();
}

async function postJournal(
  ctx: Awaited<ReturnType<typeof makeTestApp>>,
  taskId: string,
  actor: string,
  body: string,
) {
  return ctx.inject({
    method: "POST",
    url: `/api/tasks/${taskId}/journal`,
    headers: { "x-user-id": actor },
    payload: { body },
  });
}

describe("task journal", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("appends a journal entry", async () => {
    const t = await createTask(ctx, "alice", { title: "T", assigned_to: "alice" });
    const res = await postJournal(ctx, t.id, "alice", "First attempt failed, trying X next");
    expect(res.statusCode).toBe(201);
    const event = res.json();
    expect(event.kind).toBe("journal_entry");
    expect(event.body).toBe("First attempt failed, trying X next");
    expect(event.actor_id).toBe("alice");
    expect(event.by_assignee).toBe(true);
  });

  it("requires X-User-Id", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/tasks/${t.id}/journal`,
      payload: { body: "x" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("404s for unknown task", async () => {
    const res = await postJournal(ctx, "no-such-task", "alice", "x");
    expect(res.statusCode).toBe(404);
  });

  it("freezes by_assignee at write time (true when actor is current assignee)", async () => {
    const t = await createTask(ctx, "alice", { title: "T", assigned_to: "alice" });
    await postJournal(ctx, t.id, "alice", "from assignee");
    const events = (
      await ctx.inject({
        method: "GET",
        url: `/api/tasks/${t.id}/events?kind=journal_entry`,
      })
    ).json();
    expect(events).toHaveLength(1);
    expect(events[0].by_assignee).toBe(true);
  });

  it("freezes by_assignee at write time (false when actor is not current assignee)", async () => {
    const t = await createTask(ctx, "alice", { title: "T", assigned_to: "alice" });
    await postJournal(ctx, t.id, "agent-coder", "side note from a helper");
    const events = (
      await ctx.inject({
        method: "GET",
        url: `/api/tasks/${t.id}/events?kind=journal_entry`,
      })
    ).json();
    expect(events).toHaveLength(1);
    expect(events[0].by_assignee).toBe(false);
  });

  it("by_assignee is false on unassigned tasks for every author", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    await postJournal(ctx, t.id, "alice", "thoughts");
    await postJournal(ctx, t.id, "agent-coder", "more thoughts");
    const events = (
      await ctx.inject({
        method: "GET",
        url: `/api/tasks/${t.id}/events?kind=journal_entry`,
      })
    ).json();
    expect(events).toHaveLength(2);
    expect(events.every((e: { by_assignee: boolean }) => e.by_assignee === false)).toBe(true);
  });

  it("reassignment does not change by_assignee on existing entries", async () => {
    const t = await createTask(ctx, "alice", { title: "T", assigned_to: "alice" });
    await postJournal(ctx, t.id, "alice", "while assigned to alice");

    // Reassign to agent-coder
    await ctx.inject({
      method: "PATCH",
      url: `/api/tasks/${t.id}`,
      headers: { "x-user-id": "alice" },
      payload: { version: t.version, assigned_to: "agent-coder" },
    });

    await postJournal(ctx, t.id, "agent-coder", "now I'm the assignee");
    await postJournal(ctx, t.id, "alice", "now I'm just commenting");

    const events = (
      await ctx.inject({
        method: "GET",
        url: `/api/tasks/${t.id}/events?kind=journal_entry`,
      })
    ).json();
    expect(events).toHaveLength(3);
    const byActor = (actor: string, body: string) =>
      events.find(
        (e: { actor_id: string; body: string }) => e.actor_id === actor && e.body === body,
      );
    expect(byActor("alice", "while assigned to alice").by_assignee).toBe(true);
    expect(byActor("agent-coder", "now I'm the assignee").by_assignee).toBe(true);
    expect(byActor("alice", "now I'm just commenting").by_assignee).toBe(false);
  });

  it("GET /events?kind= filters by single kind", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    await ctx.inject({
      method: "POST",
      url: `/api/tasks/${t.id}/comments`,
      headers: { "x-user-id": "alice" },
      payload: { body: "a comment" },
    });
    await postJournal(ctx, t.id, "alice", "a journal entry");

    const journals = (
      await ctx.inject({
        method: "GET",
        url: `/api/tasks/${t.id}/events?kind=journal_entry`,
      })
    ).json();
    expect(journals).toHaveLength(1);
    expect(journals[0].kind).toBe("journal_entry");

    const comments = (
      await ctx.inject({
        method: "GET",
        url: `/api/tasks/${t.id}/events?kind=comment`,
      })
    ).json();
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe("comment");
  });

  it("GET /events?kind= accepts CSV", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    await ctx.inject({
      method: "POST",
      url: `/api/tasks/${t.id}/comments`,
      headers: { "x-user-id": "alice" },
      payload: { body: "a comment" },
    });
    await postJournal(ctx, t.id, "alice", "a journal entry");

    const res = await ctx.inject({
      method: "GET",
      url: `/api/tasks/${t.id}/events?kind=journal_entry,comment`,
    });
    const events = res.json();
    expect(events).toHaveLength(2);
    const kinds = events.map((e: { kind: string }) => e.kind).sort();
    expect(kinds).toEqual(["comment", "journal_entry"]);
  });

  it("GET /events?kind= with only unknown kinds returns empty", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    await postJournal(ctx, t.id, "alice", "x");
    const res = await ctx.inject({
      method: "GET",
      url: `/api/tasks/${t.id}/events?kind=not_a_real_kind`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("GET /api/tasks returns comment_count and journal_count", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    await ctx.inject({
      method: "POST",
      url: `/api/tasks/${t.id}/comments`,
      headers: { "x-user-id": "alice" },
      payload: { body: "c1" },
    });
    await ctx.inject({
      method: "POST",
      url: `/api/tasks/${t.id}/comments`,
      headers: { "x-user-id": "alice" },
      payload: { body: "c2" },
    });
    await postJournal(ctx, t.id, "alice", "j1");
    await postJournal(ctx, t.id, "alice", "j2");
    await postJournal(ctx, t.id, "alice", "j3");

    const list = (await ctx.inject({ method: "GET", url: "/api/tasks" })).json();
    const target = list.find((task: { id: string }) => task.id === t.id);
    expect(target.comment_count).toBe(2);
    expect(target.journal_count).toBe(3);
  });

  it("GET /api/tasks returns zero counts for tasks with no events of that kind", async () => {
    const t = await createTask(ctx, "alice", { title: "T" });
    const list = (await ctx.inject({ method: "GET", url: "/api/tasks" })).json();
    const target = list.find((task: { id: string }) => task.id === t.id);
    expect(target.comment_count).toBe(0);
    expect(target.journal_count).toBe(0);
  });
});
