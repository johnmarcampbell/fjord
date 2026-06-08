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
      headers: { authorization: "Bearer fjord_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
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
    expect(res.json().code).toBe("version_conflict");
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

  it("records assigned_to, due_date, and tags change events on a single update", async () => {
    const t = (await createTask(ctx, "alice", { title: "T" })).json();
    const dueAt = "2026-07-01T00:00:00.000Z";
    const res = await ctx.inject({
      method: "PATCH",
      url: `/api/tasks/${t.id}`,
      headers: { "x-user-id": "alice" },
      payload: { version: 1, assigned_to: "agent-coder", due_at: dueAt, tags: ["urgent", "backend"] },
    });
    expect(res.statusCode).toBe(200);
    // Tag round-trip on the returned task.
    const updated = res.json();
    expect(updated.assigned_to).toBe("agent-coder");
    expect(updated.due_at).toBe(dueAt);
    expect(updated.tags).toEqual(["urgent", "backend"]);

    const events = (
      await ctx.inject({ method: "GET", url: `/api/tasks/${t.id}/events` })
    ).json();

    const assigneeChange = events.find((e: any) => e.kind === "assigned_to_changed");
    expect(assigneeChange.from_value).toBe(null);
    expect(assigneeChange.to_value).toBe("agent-coder");

    const dueChange = events.find((e: any) => e.kind === "due_date_changed");
    expect(dueChange.from_value).toBe(null);
    expect(dueChange.to_value).toBe(dueAt);

    const tagsChange = events.find((e: any) => e.kind === "tags_changed");
    expect(tagsChange.from_value).toBe("[]");
    expect(tagsChange.to_value).toBe(JSON.stringify(["urgent", "backend"]));
  });

  it("emits no change events when an update sets identical values", async () => {
    const t = (await createTask(ctx, "alice", { title: "T", tags: ["x"] })).json();
    await ctx.inject({
      method: "PATCH",
      url: `/api/tasks/${t.id}`,
      headers: { "x-user-id": "alice" },
      payload: { version: 1, column: "Backlog", tags: ["x"] },
    });
    const events = (
      await ctx.inject({ method: "GET", url: `/api/tasks/${t.id}/events` })
    ).json();
    expect(events.some((e: any) => e.kind.endsWith("_changed"))).toBe(false);
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

  describe("event edit/delete", () => {
    it("author can edit their own comment", async () => {
      const t = (await createTask(ctx, "alice", { title: "T" })).json();
      const ev = (
        await ctx.inject({
          method: "POST",
          url: `/api/tasks/${t.id}/comments`,
          headers: { "x-user-id": "alice" },
          payload: { body: "original" },
        })
      ).json();

      const res = await ctx.inject({
        method: "PATCH",
        url: `/api/tasks/${t.id}/events/${ev.id}`,
        headers: { "x-user-id": "alice" },
        payload: { body: "updated" },
      });
      expect(res.statusCode).toBe(200);
      const updated = res.json();
      expect(updated.body).toBe("updated");
      expect(updated.updated_at).toBeTruthy();
    });

    it("author can edit their own journal entry", async () => {
      const t = (await createTask(ctx, "alice", { title: "T" })).json();
      const ev = (
        await ctx.inject({
          method: "POST",
          url: `/api/tasks/${t.id}/journal`,
          headers: { "x-user-id": "alice" },
          payload: { body: "old notes" },
        })
      ).json();

      const res = await ctx.inject({
        method: "PATCH",
        url: `/api/tasks/${t.id}/events/${ev.id}`,
        headers: { "x-user-id": "alice" },
        payload: { body: "new notes" },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().body).toBe("new notes");
    });

    it("non-author cannot edit another actor's comment", async () => {
      const t = (await createTask(ctx, "alice", { title: "T" })).json();
      const ev = (
        await ctx.inject({
          method: "POST",
          url: `/api/tasks/${t.id}/comments`,
          headers: { "x-user-id": "alice" },
          payload: { body: "alice's comment" },
        })
      ).json();

      const res = await ctx.inject({
        method: "PATCH",
        url: `/api/tasks/${t.id}/events/${ev.id}`,
        headers: { "x-user-id": "agent-coder" },
        payload: { body: "hacked" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("system events cannot be edited", async () => {
      const t = (await createTask(ctx, "alice", { title: "T" })).json();
      const events = (
        await ctx.inject({ method: "GET", url: `/api/tasks/${t.id}/events` })
      ).json();
      const systemEvent = events.find((e: any) => e.kind === "task_created");
      expect(systemEvent).toBeTruthy();

      const res = await ctx.inject({
        method: "PATCH",
        url: `/api/tasks/${t.id}/events/${systemEvent.id}`,
        headers: { "x-user-id": "alice" },
        payload: { body: "oops" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("author can delete their own comment when it is the last event", async () => {
      const t = (await createTask(ctx, "alice", { title: "T" })).json();
      const ev = (
        await ctx.inject({
          method: "POST",
          url: `/api/tasks/${t.id}/comments`,
          headers: { "x-user-id": "alice" },
          payload: { body: "last comment" },
        })
      ).json();

      const res = await ctx.inject({
        method: "DELETE",
        url: `/api/tasks/${t.id}/events/${ev.id}`,
        headers: { "x-user-id": "alice" },
      });
      expect(res.statusCode).toBe(204);

      const events = (
        await ctx.inject({ method: "GET", url: `/api/tasks/${t.id}/events` })
      ).json();
      expect(events.find((e: any) => e.id === ev.id)).toBeUndefined();
    });

    it("returns 404 when event does not exist", async () => {
      const t = (await createTask(ctx, "alice", { title: "T" })).json();
      const res = await ctx.inject({
        method: "DELETE",
        url: `/api/tasks/${t.id}/events/nonexistent-id`,
        headers: { "x-user-id": "alice" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("non-author cannot delete another actor's comment", async () => {
      const t = (await createTask(ctx, "alice", { title: "T" })).json();
      const ev = (
        await ctx.inject({
          method: "POST",
          url: `/api/tasks/${t.id}/comments`,
          headers: { "x-user-id": "alice" },
          payload: { body: "alice's comment" },
        })
      ).json();

      const res = await ctx.inject({
        method: "DELETE",
        url: `/api/tasks/${t.id}/events/${ev.id}`,
        headers: { "x-user-id": "agent-coder" },
      });
      expect(res.statusCode).toBe(403);
    });

    it("edit window expiry blocks edit and delete (zero-minute window)", async () => {
      // Create a custom app with editWindowMinutes = 0 so every event is immediately expired
      const tinyCtx = await makeTestApp({ editWindowMinutes: 0 });
      try {
        const t = (
          await tinyCtx.inject({
            method: "POST",
            url: "/api/tasks",
            headers: { "x-user-id": "alice" },
            payload: { title: "T" },
          })
        ).json();
        const ev = (
          await tinyCtx.inject({
            method: "POST",
            url: `/api/tasks/${t.id}/comments`,
            headers: { "x-user-id": "alice" },
            payload: { body: "hi" },
          })
        ).json();

        const editRes = await tinyCtx.inject({
          method: "PATCH",
          url: `/api/tasks/${t.id}/events/${ev.id}`,
          headers: { "x-user-id": "alice" },
          payload: { body: "edited" },
        });
        expect(editRes.statusCode).toBe(403);
        expect(editRes.json().code).toBe("edit_window_expired");

        const delRes = await tinyCtx.inject({
          method: "DELETE",
          url: `/api/tasks/${t.id}/events/${ev.id}`,
          headers: { "x-user-id": "alice" },
        });
        expect(delRes.statusCode).toBe(403);
        expect(delRes.json().code).toBe("edit_window_expired");
      } finally {
        await tinyCtx.close();
      }
    });
  });
});
