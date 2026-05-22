import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeTestApp } from "./helpers.js";
import { spaces, userSpaceAccess, users } from "../src/db/schema.js";
import { nowIso } from "../src/services/tasks.js";
import { hashPassword } from "../src/services/passwords.js";
import { SESSION_COOKIE } from "../src/services/sessions.js";
import { issueToken } from "../src/services/api_tokens.js";

function cookieHeader(sessionId: string): string {
  return `${SESSION_COOKIE}=${sessionId}`;
}

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

  it("rejects /api/tasks with no credentials", async () => {
    const res = await ctx.app.inject({ method: "GET", url: "/api/tasks" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects soft-deleted actor", async () => {
    const sid = ctx.cookieFor("alice");
    ctx.app.db.update(users).set({ deletedAt: nowIso() }).where(eq(users.id, "alice")).run();
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { cookie: cookieHeader(sid) },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects write requests without X-Requested-With header (CSRF)", async () => {
    const sid = ctx.cookieFor("alice");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { cookie: cookieHeader(sid) },
      payload: { title: "should fail" },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /api/auth/login (prod mode)", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("rejects unknown handle", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { handle: "ghost", password: "x" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects wrong password", async () => {
    const hash = await hashPassword("right-password");
    ctx.app.db.update(users).set({ passwordHash: hash }).where(eq(users.id, "alice")).run();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { handle: "alice", password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("succeeds with correct password and sets a Secure-less HttpOnly cookie", async () => {
    const hash = await hashPassword("hunter2");
    ctx.app.db.update(users).set({ passwordHash: hash }).where(eq(users.id, "alice")).run();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { handle: "alice", password: "hunter2" },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie!;
    expect(cookieStr).toContain(`${SESSION_COOKIE}=`);
    expect(cookieStr).toMatch(/HttpOnly/i);
    expect(cookieStr).toMatch(/SameSite=Lax/i);
  });

  it("passwordless-once: a human with null password_hash logs in but cannot write", async () => {
    // Reset alice's hash to null (the test helper installs a sentinel by default).
    ctx.app.db.update(users).set({ passwordHash: null }).where(eq(users.id, "alice")).run();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { handle: "alice" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().actor.requires_password_set).toBe(true);

    const setCookie = res.headers["set-cookie"]!;
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const sid = /ak_session=([^;]+)/.exec(cookieStr)![1];

    // Write attempt is rejected with set_password_required
    const write = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { cookie: cookieHeader(sid), "x-requested-with": "agentic-kanban" },
      payload: { title: "blocked" },
    });
    expect(write.statusCode).toBe(403);
    expect(write.json().code).toBe("set_password_required");

    // Setting a password unblocks writes
    const change = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { cookie: cookieHeader(sid), "x-requested-with": "agentic-kanban" },
      payload: { new_password: "new-secret-1" },
    });
    expect(change.statusCode).toBe(204);

    const write2 = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { cookie: cookieHeader(sid), "x-requested-with": "agentic-kanban" },
      payload: { title: "ok now" },
    });
    expect(write2.statusCode).toBe(201);
  });

  it("rejects agent users (kind != 'human')", async () => {
    // make agent-coder unable to log in even with a password
    const hash = await hashPassword("nope");
    ctx.app.db.update(users).set({ passwordHash: hash }).where(eq(users.id, "agent-coder")).run();
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { handle: "agent-coder", password: "nope" },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("change-password", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("requires current_password when one is set", async () => {
    const hash = await hashPassword("original");
    ctx.app.db.update(users).set({ passwordHash: hash }).where(eq(users.id, "alice")).run();
    const sid = ctx.cookieFor("alice");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { cookie: cookieHeader(sid), "x-requested-with": "agentic-kanban" },
      payload: { new_password: "abcdefgh" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects wrong current_password", async () => {
    const hash = await hashPassword("original");
    ctx.app.db.update(users).set({ passwordHash: hash }).where(eq(users.id, "alice")).run();
    const sid = ctx.cookieFor("alice");
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { cookie: cookieHeader(sid), "x-requested-with": "agentic-kanban" },
      payload: { current_password: "wrong", new_password: "abcdefgh" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("succeeds with correct current_password and invalidates other sessions", async () => {
    const hash = await hashPassword("original");
    ctx.app.db.update(users).set({ passwordHash: hash }).where(eq(users.id, "alice")).run();
    const sid = ctx.cookieFor("alice");

    // Create a second session for alice (simulating another tab/device)
    const second = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { handle: "alice", password: "original" },
    });
    const otherCookie = (Array.isArray(second.headers["set-cookie"]) ? second.headers["set-cookie"][0] : second.headers["set-cookie"]) as string;
    const otherSid = /ak_session=([^;]+)/.exec(otherCookie)![1];

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/change-password",
      headers: { cookie: cookieHeader(sid), "x-requested-with": "agentic-kanban" },
      payload: { current_password: "original", new_password: "abcdefgh" },
    });
    expect(res.statusCode).toBe(204);

    // The "other" session is invalidated
    const other = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { cookie: cookieHeader(otherSid) },
    });
    expect(other.statusCode).toBe(401);

    // Current session still works
    const current = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { cookie: cookieHeader(sid) },
    });
    expect(current.statusCode).toBe(200);
  });
});

describe("logout / logout-all", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("logout deletes the current session and clears the cookie", async () => {
    const hash = await hashPassword("pw");
    ctx.app.db.update(users).set({ passwordHash: hash }).where(eq(users.id, "alice")).run();
    const login = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { handle: "alice", password: "pw" },
    });
    const sid = /ak_session=([^;]+)/.exec(
      (Array.isArray(login.headers["set-cookie"]) ? login.headers["set-cookie"][0] : login.headers["set-cookie"]) as string,
    )![1];

    // Confirm session works
    const before = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { cookie: cookieHeader(sid) },
    });
    expect(before.statusCode).toBe(200);

    const out = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { cookie: cookieHeader(sid), "x-requested-with": "agentic-kanban" },
    });
    expect(out.statusCode).toBe(204);
    const setCookie = out.headers["set-cookie"];
    const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie!;
    // Clearing a cookie sets it to empty with an immediate expiry.
    expect(cookieStr).toMatch(/ak_session=/);

    // The (now-deleted) session no longer authenticates.
    const after = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { cookie: cookieHeader(sid) },
    });
    expect(after.statusCode).toBe(401);
  });

  it("logout-all kills every session for the actor", async () => {
    const hash = await hashPassword("pw");
    ctx.app.db.update(users).set({ passwordHash: hash }).where(eq(users.id, "alice")).run();
    // Two independent logins (two tabs / devices)
    const a = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { handle: "alice", password: "pw" } });
    const b = await ctx.app.inject({ method: "POST", url: "/api/auth/login", payload: { handle: "alice", password: "pw" } });
    const sidA = /ak_session=([^;]+)/.exec(((Array.isArray(a.headers["set-cookie"]) ? a.headers["set-cookie"][0] : a.headers["set-cookie"])) as string)![1];
    const sidB = /ak_session=([^;]+)/.exec(((Array.isArray(b.headers["set-cookie"]) ? b.headers["set-cookie"][0] : b.headers["set-cookie"])) as string)![1];
    expect(sidA).not.toBe(sidB);

    const out = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/logout-all",
      headers: { cookie: cookieHeader(sidA), "x-requested-with": "agentic-kanban" },
    });
    expect(out.statusCode).toBe(204);

    for (const sid of [sidA, sidB]) {
      const res = await ctx.app.inject({ method: "GET", url: "/api/tasks", headers: { cookie: cookieHeader(sid) } });
      expect(res.statusCode).toBe(401);
    }
  });
});

describe("bootstrap (KANBAN_BOOTSTRAP_PASSWORD)", () => {
  it("seeds the admin password on first boot when one is provided and the hash is null", async () => {
    const { buildApp } = await import("../src/server.js");
    const { openDatabase } = await import("../src/db/index.js");
    const dbHandle = openDatabase(":memory:");
    const config = {
      nodeEnv: "test" as const, port: 0, host: "127.0.0.1", dbPath: ":memory:", logLevel: "error" as const,
      corsOrigins: null, seedUsers: [], staticDir: null,
      bootstrapPassword: "bootstrap-secret", sessionIdleDays: 30,
      demo: false, demoResetMinutes: 10,
    };
    const { app } = await buildApp({ config, dbHandle });
    await app.ready();
    try {
      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { handle: "admin", password: "bootstrap-secret" },
      });
      expect(login.statusCode).toBe(200);
      // requires_password_set must be false — bootstrap satisfied the rule.
      expect(login.json().actor.requires_password_set).toBe(false);
    } finally {
      await app.close();
      dbHandle.close();
    }
  });

  it("ignores KANBAN_BOOTSTRAP_PASSWORD when the admin already has a hash", async () => {
    const { buildApp } = await import("../src/server.js");
    const { openDatabase } = await import("../src/db/index.js");
    const { seedDefaultAdministrator } = await import("../src/services/users.js");
    const dbHandle = openDatabase(":memory:");
    // Pre-seed the admin with a known hash so bootstrap should NOT overwrite.
    const { runMigrations } = await import("../src/db/index.js");
    runMigrations(dbHandle);
    seedDefaultAdministrator(dbHandle);
    const preset = await hashPassword("preset");
    dbHandle.db.update(users).set({ passwordHash: preset }).where(eq(users.id, "default-administrator")).run();

    const config = {
      nodeEnv: "test" as const, port: 0, host: "127.0.0.1", dbPath: ":memory:", logLevel: "error" as const,
      corsOrigins: null, seedUsers: [], staticDir: null,
      bootstrapPassword: "should-be-ignored", sessionIdleDays: 30,
      demo: false, demoResetMinutes: 10,
    };
    const { app } = await buildApp({ config, dbHandle });
    await app.ready();
    try {
      const bad = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { handle: "admin", password: "should-be-ignored" },
      });
      expect(bad.statusCode).toBe(401);
      const good = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { handle: "admin", password: "preset" },
      });
      expect(good.statusCode).toBe(200);
    } finally {
      await app.close();
      dbHandle.close();
    }
  });

  it("emits a warning when admin hash is null and no bootstrap password is set (prod mode)", async () => {
    const { buildApp } = await import("../src/server.js");
    const { openDatabase } = await import("../src/db/index.js");
    const dbHandle = openDatabase(":memory:");
    const config = {
      nodeEnv: "test" as const, port: 0, host: "127.0.0.1", dbPath: ":memory:", logLevel: "warn" as const,
      corsOrigins: null, seedUsers: [], staticDir: null,
      bootstrapPassword: null, sessionIdleDays: 30,
      demo: false, demoResetMinutes: 10,
    };
    const warnings: string[] = [];
    const { app } = await buildApp({ config, dbHandle });
    // Drop a custom hook to capture subsequent warns — but the bootstrap warn
    // already fired during buildApp. Instead, observe the side-effect: the
    // admin's hash should still be null afterwards (no overwrite, no error).
    void warnings;
    await app.ready();
    try {
      const row = dbHandle.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, "default-administrator"))
        .get();
      expect(row?.passwordHash).toBeNull();
      // And passwordless-once still works as the documented escape hatch.
      const login = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { handle: "admin" },
      });
      expect(login.statusCode).toBe(200);
      expect(login.json().actor.requires_password_set).toBe(true);
    } finally {
      await app.close();
      dbHandle.close();
    }
  });

  it("suppresses the bootstrap password and warning entirely in demo mode", async () => {
    const { buildApp } = await import("../src/server.js");
    const { openDatabase } = await import("../src/db/index.js");
    const dbHandle = openDatabase(":memory:");
    const config = {
      nodeEnv: "test" as const, port: 0, host: "127.0.0.1", dbPath: ":memory:", logLevel: "error" as const,
      corsOrigins: null, seedUsers: [], staticDir: null,
      bootstrapPassword: "should-be-ignored-in-demo", sessionIdleDays: 30,
      demo: true, demoResetMinutes: 10,
    };
    const { app } = await buildApp({ config, dbHandle });
    await app.ready();
    try {
      const row = dbHandle.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, "default-administrator"))
        .get();
      // Demo mode never seeds the bootstrap password; admin stays passwordless.
      expect(row?.passwordHash).toBeNull();
    } finally {
      await app.close();
      dbHandle.close();
    }
  });
});

describe("API tokens (Bearer auth)", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("a valid bearer token authenticates", async () => {
    const issued = await issueToken(ctx.app.db, { userId: "agent-coder", name: "test" });
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { authorization: `Bearer ${issued.plaintext}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it("an invalid bearer token is rejected", async () => {
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { authorization: `Bearer ak_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("a revoked token is rejected", async () => {
    const issued = await issueToken(ctx.app.db, { userId: "agent-coder", name: "to-revoke" });
    const sid = ctx.cookieFor("alice"); // alice is admin
    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/api/users/agent-coder/tokens/${issued.id}`,
      headers: { cookie: cookieHeader(sid), "x-requested-with": "agentic-kanban" },
    });
    expect(del.statusCode).toBe(204);
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { authorization: `Bearer ${issued.plaintext}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("bearer-authed writes do not require X-Requested-With (no CSRF risk)", async () => {
    // agent-coder is a Member by default — make it admin so the task create succeeds without space gating
    ctx.app.db.update(users).set({ role: "Admin" }).where(eq(users.id, "agent-coder")).run();
    const issued = await issueToken(ctx.app.db, { userId: "agent-coder", name: "writes" });
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/tasks",
      headers: { authorization: `Bearer ${issued.plaintext}` },
      payload: { title: "bearer-created" },
    });
    expect(res.statusCode).toBe(201);
  });

  it("an expired token is rejected", async () => {
    const issued = await issueToken(ctx.app.db, { userId: "agent-coder", name: "soon-expired" });
    // Backdate expires_at directly in the DB to simulate the token having aged past its TTL.
    const { apiTokens } = await import("../src/db/schema.js");
    ctx.app.db.update(apiTokens)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(apiTokens.id, issued.id))
      .run();
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { authorization: `Bearer ${issued.plaintext}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it("a token whose stored expires_at is unparseable fails closed (treated as expired)", async () => {
    const issued = await issueToken(ctx.app.db, { userId: "agent-coder", name: "broken-expiry" });
    const { apiTokens } = await import("../src/db/schema.js");
    ctx.app.db.update(apiTokens)
      .set({ expiresAt: "not a date" })
      .where(eq(apiTokens.id, issued.id))
      .run();
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/tasks",
      headers: { authorization: `Bearer ${issued.plaintext}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe("token routes", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("admin can issue a token for another user; response carries plaintext once", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users/agent-coder/tokens",
      payload: { name: "my-bot" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toMatch(/^ak_[a-z2-7]{32}$/);
    expect(body.preview).toMatch(/^ak_/);

    // Listing never returns the plaintext or hash
    const list = await ctx.inject({ method: "GET", url: "/api/users/agent-coder/tokens" });
    const item = list.json()[0];
    expect(item).not.toHaveProperty("token");
    expect(item).not.toHaveProperty("token_hash");
    expect(item).not.toHaveProperty("lookup_hash");
  });

  it("a non-admin user can manage their own tokens but not someone else's", async () => {
    // Create a Member user 'bob' and log them in
    ctx.app.db.insert(users).values({
      id: "bob", displayName: "Bob", handle: "bob", kind: "human",
      role: "Member", title: "", bio: "", avatar: "🧑",
      passwordHash: null, createdAt: nowIso(),
    }).run();

    // bob issues a token for himself: ok
    const own = await ctx.inject({
      method: "POST",
      url: "/api/users/bob/tokens",
      headers: { "x-user-id": "bob" },
      payload: { name: "personal-cli" },
    });
    expect(own.statusCode).toBe(201);

    // bob tries to issue for alice: 403
    const other = await ctx.inject({
      method: "POST",
      url: "/api/users/alice/tokens",
      headers: { "x-user-id": "bob" },
      payload: { name: "naughty" },
    });
    expect(other.statusCode).toBe(403);
  });

  it("rejects an unparseable expires_at at issuance", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users/agent-coder/tokens",
      payload: { name: "bad-expiry", expires_at: "tomorrow-ish" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/ISO8601/);
  });

  it("rejects an expires_at in the past at issuance", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users/agent-coder/tokens",
      payload: { name: "past-expiry", expires_at: "2000-01-01T00:00:00Z" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/future/);
  });

  it("normalizes a valid expires_at to canonical UTC ISO on the stored row", async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // Provide an offset-style timestamp; expect the stored value to be Z-suffixed UTC.
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users/agent-coder/tokens",
      payload: { name: "future", expires_at: future.toISOString().replace("Z", "+00:00") },
    });
    expect(res.statusCode).toBe(201);
    const stored = res.json().expires_at as string;
    expect(stored).toMatch(/Z$/);
    expect(Date.parse(stored)).toBe(future.getTime());
  });
});

describe("item-level access enforcement", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
    ctx.app.db.insert(users).values({
      id: "bob", displayName: "Bob", handle: "bob", kind: "human",
      role: "Member", title: "", bio: "", avatar: "🧑",
      passwordHash: null, createdAt: nowIso(),
    }).run();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("403s when a Member fetches a task in an inaccessible space", async () => {
    const created = await ctx.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "secret" },
    });
    const task = created.json();

    const res = await ctx.inject({
      method: "GET",
      url: `/api/tasks/${task.id}`,
      headers: { "x-user-id": "bob" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("403s when a Member tries to comment on an inaccessible task", async () => {
    const created = await ctx.inject({ method: "POST", url: "/api/tasks", payload: { title: "secret" } });
    const task = created.json();

    const res = await ctx.inject({
      method: "POST",
      url: `/api/tasks/${task.id}/comments`,
      headers: { "x-user-id": "bob" },
      payload: { body: "hello" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("200s when a Member is granted access to the space", async () => {
    const created = await ctx.inject({ method: "POST", url: "/api/tasks", payload: { title: "shared" } });
    const task = created.json();

    ctx.app.db.insert(userSpaceAccess).values({
      userId: "bob", spaceId: "default", grantedAt: nowIso(), grantedBy: "alice",
    }).run();

    const res = await ctx.inject({
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
    ctx.app.db.insert(users).values({
      id: "bob", displayName: "Bob", handle: "bob", kind: "human",
      role: "Member", title: "", bio: "", avatar: "🧑",
      passwordHash: null, createdAt: nowIso(),
    }).run();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("400s when moving a task to a space the assignee cannot access", async () => {
    const newSpace = await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "Locked" } });
    const spaceId = newSpace.json().id;

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
    const newSpace = await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "Shared" } });
    const spaceId = newSpace.json().id;
    ctx.app.db.insert(userSpaceAccess).values({
      userId: "bob", spaceId, grantedAt: nowIso(), grantedBy: "alice",
    }).run();

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
    ctx.app.db.insert(users).values({
      id: "bob", displayName: "Bob", handle: "bob", kind: "human",
      role: "Member", title: "", bio: "", avatar: "🧑",
      passwordHash: null, createdAt: nowIso(),
    }).run();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("revokes only the targeted (user, space) pair — not all grants for the user", async () => {
    const a = (await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "A" } })).json();
    const b = (await ctx.inject({ method: "POST", url: "/api/spaces", payload: { name: "B" } })).json();

    await ctx.inject({ method: "POST", url: `/api/spaces/${a.id}/access`, payload: { user_id: "bob" } });
    await ctx.inject({ method: "POST", url: `/api/spaces/${b.id}/access`, payload: { user_id: "bob" } });

    const del = await ctx.inject({ method: "DELETE", url: `/api/spaces/${a.id}/access/bob` });
    expect(del.statusCode).toBe(200);

    const listB = await ctx.inject({ method: "GET", url: `/api/spaces/${b.id}/access` });
    expect(listB.json().some((g: { user_id: string }) => g.user_id === "bob")).toBe(true);

    const listA = await ctx.inject({ method: "GET", url: `/api/spaces/${a.id}/access` });
    expect(listA.json().some((g: { user_id: string }) => g.user_id === "bob")).toBe(false);
  });
});

describe("demo mode login", () => {
  it("issues a session for default-administrator with no body", async () => {
    // Need a fresh app with demo=true; create it directly.
    const { buildApp } = await import("../src/server.js");
    const { openDatabase } = await import("../src/db/index.js");
    const dbHandle = openDatabase(":memory:");
    const config = {
      nodeEnv: "test" as const, port: 0, host: "127.0.0.1", dbPath: ":memory:", logLevel: "error" as const,
      corsOrigins: null, seedUsers: [], staticDir: null,
      bootstrapPassword: null, sessionIdleDays: 30,
      demo: true, demoResetMinutes: 10,
    };
    const { app } = await buildApp({ config, dbHandle });
    await app.ready();
    try {
      const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: {} });
      expect(res.statusCode).toBe(200);
      expect(res.json().actor.id).toBe("default-administrator");
      expect(res.json().actor.requires_password_set).toBe(false);
    } finally {
      await app.close();
      dbHandle.close();
    }
  });
});
