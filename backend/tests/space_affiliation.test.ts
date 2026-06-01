import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { shouldForwardEvent } from "../src/routes/stream.js";
import type { StreamEvent } from "@fjord/shared";
import { makeTestApp } from "./helpers.js";

describe("Actor.affiliatedSpaceIds", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => { ctx = await makeTestApp(); });
  afterEach(async () => { await ctx.close(); });

  it("Admin gets accessibleSpaceIds='all' and affiliatedSpaceIds = owned+granted set", async () => {
    // alice is Admin; she owns the default space (created by seedDefaultAdministrator's backfill
    // which sets default's created_by to default-administrator, so alice may not own it — but
    // let's verify via the /api/spaces list that affiliated reflects ownership).
    const spaces = (await ctx.inject({ method: "GET", url: "/api/spaces" })).json();
    // alice created 'default' space? No — default is created by the default-administrator.
    // alice owns any space she creates.
    const newSpace = (
      await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "Alice-owned" } })
    ).json();
    const spacesAfter = (await ctx.inject({ method: "GET", url: "/api/spaces" })).json();
    const aliceOwned = spacesAfter.find((s: { id: string }) => s.id === newSpace.id);
    // alice owns it → affiliated = true
    expect(aliceOwned.affiliated).toBe(true);

    // The default space is owned by default-administrator, not alice — so alice is NOT affiliated
    // unless granted. In the test app there are no explicit grants.
    const defaultSpace = spacesAfter.find((s: { id: string }) => s.id === "default");
    expect(defaultSpace).toBeDefined();
    // alice is Admin, so she can see it, but should not be affiliated
    expect(defaultSpace.affiliated).toBe(false);
  });

  it("Member gets accessibleSpaceIds = affiliatedSpaceIds (owned+granted)", async () => {
    // agent-coder is seeded as Admin in helpers, so let's create a real Member for this test
    const createRes = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "member-bob", display_name: "Bob", kind: "human", role: "Member" },
    });
    expect(createRes.statusCode).toBe(201);

    // Grant bob access to a new space
    const space = (
      await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "BobSpace" } })
    ).json();
    const grantRes = await ctx.inject({
      method: "POST",
      url: `/api/spaces/${space.id}/access`,
      payload: { user_id: "member-bob" },
    });
    expect(grantRes.statusCode).toBe(201);

    // Bob should see the space as affiliated
    const bobSpaces = (
      await ctx.inject({
        method: "GET",
        url: "/api/spaces",
        headers: { "x-user-id": "member-bob" },
      })
    ).json();
    const bobSpace = bobSpaces.find((s: { id: string }) => s.id === space.id);
    expect(bobSpace).toBeDefined();
    expect(bobSpace.affiliated).toBe(true);
  });
});

describe("POST /api/spaces/:id/access — Admin targets", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => { ctx = await makeTestApp(); });
  afterEach(async () => { await ctx.close(); });

  it("accepts an Admin as grant target", async () => {
    // Create a second Admin user
    await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "admin-bob", display_name: "Bob Admin", kind: "human", role: "Admin" },
    });
    const space = (
      await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "TestSpace" } })
    ).json();

    const res = await ctx.inject({
      method: "POST",
      url: `/api/spaces/${space.id}/access`,
      payload: { user_id: "admin-bob" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user_id).toBe("admin-bob");
  });

  it("GET /api/spaces/:id/access returns the Admin grant row", async () => {
    await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "admin-bob", display_name: "Bob Admin", kind: "human", role: "Admin" },
    });
    const space = (
      await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "TestSpace" } })
    ).json();
    await ctx.inject({
      method: "POST",
      url: `/api/spaces/${space.id}/access`,
      payload: { user_id: "admin-bob" },
    });

    const grants = (
      await ctx.inject({ method: "GET", url: `/api/spaces/${space.id}/access` })
    ).json();
    expect(grants.find((g: { user_id: string }) => g.user_id === "admin-bob")).toBeDefined();
  });
});

describe("GET /api/spaces — affiliated flag", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => { ctx = await makeTestApp(); });
  afterEach(async () => { await ctx.close(); });

  it("includes affiliated=true for spaces the actor owns", async () => {
    const space = (
      await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "MySpace" } })
    ).json();
    const list = (await ctx.inject({ method: "GET", url: "/api/spaces" })).json();
    const found = list.find((s: { id: string }) => s.id === space.id);
    expect(found.affiliated).toBe(true);
  });

  it("includes affiliated=false for spaces the Admin sees but has not joined", async () => {
    // Create a Member, let them create a space, Admin should see it as not-affiliated
    await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "member-carol", display_name: "Carol", kind: "human", role: "Member" },
    });

    // alice creates the space on behalf of member (alice is admin, so grant carol access first)
    // Better: create the space as alice (admin) then alice sees it as affiliated (she owns it).
    // Create a space owned by alice → affiliated = true
    const aliceSpace = (
      await ctx.inject({
        method: "POST",
        url: "/api/spaces",
        payload: { name: "AliceSpace" },
        headers: { "x-user-id": "alice" },
      })
    ).json();

    // Grant carol access to alice's space, then create another space as carol (not possible, carol is Member
    // and accessing as carol would give her only her own spaces)
    // Instead: verify that an Admin-visible space they don't own and haven't been granted shows affiliated=false
    const list = (
      await ctx.inject({
        method: "GET",
        url: "/api/spaces",
        headers: { "x-user-id": "alice" },
      })
    ).json();
    // alice owns aliceSpace → affiliated = true
    const aliceSpaceResult = list.find((s: { id: string }) => s.id === aliceSpace.id);
    expect(aliceSpaceResult.affiliated).toBe(true);

    // default space is owned by default-administrator, not alice — affiliated = false for alice
    const defaultResult = list.find((s: { id: string }) => s.id === "default");
    expect(defaultResult.affiliated).toBe(false);
  });

  it("includes affiliated=true for spaces the Admin has been explicitly granted", async () => {
    // Create a space owned by default-administrator (by posting as default-administrator)
    const space = (
      await ctx.inject({
        method: "POST",
        url: "/api/spaces",
        payload: { name: "AdminSpace" },
        headers: { "x-user-id": "default-administrator" },
      })
    ).json();

    // Grant alice access to it
    await ctx.inject({
      method: "POST",
      url: `/api/spaces/${space.id}/access`,
      payload: { user_id: "alice" },
      headers: { "x-user-id": "default-administrator" },
    });

    // alice should now see it as affiliated
    const list = (
      await ctx.inject({
        method: "GET",
        url: "/api/spaces",
        headers: { "x-user-id": "alice" },
      })
    ).json();
    const result = list.find((s: { id: string }) => s.id === space.id);
    expect(result.affiliated).toBe(true);
  });
});

describe("shouldForwardEvent — stream affiliation filtering", () => {
  const affiliated = new Set(["space-a", "space-b"]);

  const created = (space_id: string): StreamEvent =>
    ({ type: "task.created", task_id: "t1", space_id });
  const updated = (space_id: string): StreamEvent =>
    ({ type: "task.updated", task_id: "t1", version: 2, space_id });
  const deleted = (space_id: string): StreamEvent =>
    ({ type: "task.deleted", task_id: "t1", space_id });
  const demoReset: StreamEvent = { type: "demo.reset" };

  it("forwards events for affiliated spaces", () => {
    expect(shouldForwardEvent(created("space-a"), affiliated)).toBe(true);
    expect(shouldForwardEvent(updated("space-b"), affiliated)).toBe(true);
  });

  it("suppresses events for spaces the actor has not joined", () => {
    expect(shouldForwardEvent(created("space-c"), affiliated)).toBe(false);
    expect(shouldForwardEvent(deleted("space-z"), affiliated)).toBe(false);
  });

  it("always forwards demo.reset regardless of affiliation", () => {
    const none = new Set<string>();
    expect(shouldForwardEvent(demoReset, none)).toBe(true);
    expect(shouldForwardEvent(demoReset, affiliated)).toBe(true);
  });

  it("non-affiliated Admin (empty set) receives no events for any space", () => {
    const emptySet = new Set<string>();
    expect(shouldForwardEvent(updated("space-a"), emptySet)).toBe(false);
  });

  it("non-affiliated Admin receives events only for spaces they have joined", () => {
    const afterJoin = new Set(["space-a"]);
    expect(shouldForwardEvent(updated("space-a"), afterJoin)).toBe(true);
    expect(shouldForwardEvent(updated("space-b"), afterJoin)).toBe(false);
  });
});

describe("canManageSpace — Admin powers preserved regardless of affiliation", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => { ctx = await makeTestApp(); });
  afterEach(async () => { await ctx.close(); });

  it("Admin can rename a space they have not joined", async () => {
    // Create a space as default-administrator (alice won't own it)
    const space = (
      await ctx.inject({
        method: "POST",
        url: "/api/spaces",
        payload: { name: "DASpace" },
        headers: { "x-user-id": "default-administrator" },
      })
    ).json();

    // alice is Admin but has no grant for this space — she should still be able to rename it
    const renamed = await ctx.inject({
      method: "PATCH",
      url: `/api/spaces/${space.id}`,
      payload: { name: "Renamed" },
      headers: { "x-user-id": "alice" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe("Renamed");
  });
});
