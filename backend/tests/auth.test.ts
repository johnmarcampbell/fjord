import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestApp } from "./helpers.js";
import { resolveActor } from "../src/auth/actor.js";
import { spaces, userSpaceAccess, users } from "../src/db/schema.js";
import { nowIso } from "../src/services/tasks.js";

describe("resolveActor", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("returns 400 when the header is missing", async () => {
    const result = await resolveActor(ctx.app.db, undefined, false);
    expect(result).toEqual({ error: "Missing required header: x-user-id", status: 400 });
  });

  it("returns 400 for an unknown user (non-demo)", async () => {
    const result = await resolveActor(ctx.app.db, "ghost", false);
    expect("error" in result).toBe(true);
    expect((result as { status: 400 }).status).toBe(400);
  });

  it("returns 400 for a soft-deleted user", async () => {
    ctx.app.db
      .update(users)
      .set({ deletedAt: nowIso() })
      .where(eq(users.id, "alice"))
      .run();
    const result = await resolveActor(ctx.app.db, "alice", false);
    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/deleted/i);
  });

  it("returns role + 'all' for Admin (seeded users default to Admin)", async () => {
    const result = await resolveActor(ctx.app.db, "alice", false);
    expect("actor" in result).toBe(true);
    if (!("actor" in result)) return;
    expect(result.actor.role).toBe("Admin");
    expect(result.actor.accessibleSpaceIds).toBe("all");
  });

  it("returns owned + granted spaces for a Member", async () => {
    // Add a Member user with no grants
    ctx.app.db
      .insert(users)
      .values({
        id: "bob",
        displayName: "Bob",
        handle: "bob",
        kind: "human",
        role: "Member",
        title: "",
        bio: "",
        avatar: "🧑",
        tokenHash: null,
        createdAt: nowIso(),
      })
      .run();

    // Empty case
    let result = await resolveActor(ctx.app.db, "bob", false);
    if (!("actor" in result)) throw new Error("expected actor");
    expect(result.actor.role).toBe("Member");
    expect(result.actor.accessibleSpaceIds).not.toBe("all");
    expect((result.actor.accessibleSpaceIds as Set<string>).size).toBe(0);

    // Owned space
    ctx.app.db
      .insert(spaces)
      .values({
        id: "bob-space",
        name: "Bob's Space",
        description: "",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        archivedAt: null,
        createdBy: "bob",
      })
      .run();

    // Granted space
    ctx.app.db
      .insert(userSpaceAccess)
      .values({ userId: "bob", spaceId: "default", grantedAt: nowIso(), grantedBy: "alice" })
      .run();

    result = await resolveActor(ctx.app.db, "bob", false);
    if (!("actor" in result)) throw new Error("expected actor");
    const set = result.actor.accessibleSpaceIds as Set<string>;
    expect(set.has("bob-space")).toBe(true);
    expect(set.has("default")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("auto-creates an unknown user when demo=true", async () => {
    const result = await resolveActor(ctx.app.db, "fresh", true);
    if (!("actor" in result)) throw new Error("expected actor");
    expect(result.actor.id).toBe("fresh");
    expect(result.actor.role).toBe("Member");
  });
});

describe("preHandler integration", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("allow-lists /api/health (no actor required)", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
  });

  it("rejects /api/tasks with no actor header", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/tasks" });
    expect(res.statusCode).toBe(400);
  });

  it("rejects soft-deleted actor", async () => {
    ctx.app.db
      .update(users)
      .set({ deletedAt: nowIso() })
      .where(eq(users.id, "alice"))
      .run();
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { "x-user-id": "alice" },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("item-level access enforcement", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
    // Add a Member with no grants
    ctx.app.db
      .insert(users)
      .values({
        id: "bob",
        displayName: "Bob",
        handle: "bob",
        kind: "human",
        role: "Member",
        title: "",
        bio: "",
        avatar: "🧑",
        tokenHash: null,
        createdAt: nowIso(),
      })
      .run();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("403s when a Member fetches a task in an inaccessible space", async () => {
    // alice (Admin) creates a task in the default space
    const created = await ctx.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "secret" },
    });
    const task = created.json();

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/tasks/${task.id}`,
      headers: { "x-user-id": "bob" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("403s when a Member tries to comment on an inaccessible task", async () => {
    const created = await ctx.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "secret" },
    });
    const task = created.json();

    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/comments`,
      headers: { "x-user-id": "bob" },
      payload: { body: "hello" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("200s when a Member is granted access to the space", async () => {
    const created = await ctx.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "shared" },
    });
    const task = created.json();

    ctx.app.db
      .insert(userSpaceAccess)
      .values({ userId: "bob", spaceId: "default", grantedAt: nowIso(), grantedBy: "alice" })
      .run();

    const res = await ctx.app.inject({
      method: "GET",
      url: `/api/tasks/${task.id}`,
      headers: { "x-user-id": "bob" },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("assignee-orphan guard", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
    // bob is a Member with no grants
    ctx.app.db
      .insert(users)
      .values({
        id: "bob",
        displayName: "Bob",
        handle: "bob",
        kind: "human",
        role: "Member",
        title: "",
        bio: "",
        avatar: "🧑",
        tokenHash: null,
        createdAt: nowIso(),
      })
      .run();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("400s when moving a task to a space the assignee cannot access", async () => {
    // alice creates a target space bob can't access
    const newSpace = await ctx.inject({
      method: "POST",
      url: "/api/spaces",
      payload: { name: "Locked" },
    });
    const spaceId = newSpace.json().id;

    // create task in default and assign to bob
    const created = await ctx.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "bob's task", assigned_to: "bob" },
    });
    const task = created.json();

    const res = await ctx.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { version: task.version, space_id: spaceId },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/does not have access/);
  });

  it("succeeds after bob is granted access to destination", async () => {
    const newSpace = await ctx.inject({
      method: "POST",
      url: "/api/spaces",
      payload: { name: "Shared" },
    });
    const spaceId = newSpace.json().id;

    ctx.app.db
      .insert(userSpaceAccess)
      .values({ userId: "bob", spaceId, grantedAt: nowIso(), grantedBy: "alice" })
      .run();

    const created = await ctx.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "bob's task", assigned_to: "bob" },
    });
    const task = created.json();

    const res = await ctx.inject({
      method: "PATCH",
      url: `/api/tasks/${task.id}`,
      payload: { version: task.version, space_id: spaceId },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("space access grant routes", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
    ctx.app.db
      .insert(users)
      .values({
        id: "bob",
        displayName: "Bob",
        handle: "bob",
        kind: "human",
        role: "Member",
        title: "",
        bio: "",
        avatar: "🧑",
        tokenHash: null,
        createdAt: nowIso(),
      })
      .run();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("revokes only the targeted (user, space) pair — not all grants for the user", async () => {
    // Create two spaces (as alice, the Admin)
    const a = (
      await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "A" } })
    ).json();
    const b = (
      await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "B" } })
    ).json();

    // Grant bob access to both
    await ctx.inject({
      method: "POST",
      url: `/api/spaces/${a.id}/access`,
      payload: { user_id: "bob" },
    });
    await ctx.inject({
      method: "POST",
      url: `/api/spaces/${b.id}/access`,
      payload: { user_id: "bob" },
    });

    // Revoke only space A
    const del = await ctx.inject({
      method: "DELETE",
      url: `/api/spaces/${a.id}/access/bob`,
    });
    expect(del.statusCode).toBe(200);

    // bob's grant on B must remain
    const listB = await ctx.inject({ method: "GET", url: `/api/spaces/${b.id}/access` });
    expect(listB.json().some((g: { user_id: string }) => g.user_id === "bob")).toBe(true);

    // bob's grant on A must be gone
    const listA = await ctx.inject({ method: "GET", url: `/api/spaces/${a.id}/access` });
    expect(listA.json().some((g: { user_id: string }) => g.user_id === "bob")).toBe(false);
  });
});
