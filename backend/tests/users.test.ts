import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers.js";

describe("users", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("lists seeded users", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/users" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.map((u: any) => u.id).sort()).toEqual(["agent-coder", "alice"]);
  });

  it("creates a new user", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBe("bob");
  });

  it("rejects duplicate user creation", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "alice", display_name: "Alice", kind: "human" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects invalid user kind", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "x", display_name: "X", kind: "robot" },
    });
    expect(res.statusCode).toBe(400);
  });
});
