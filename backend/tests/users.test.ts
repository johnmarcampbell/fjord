import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { eq } from "drizzle-orm";
import { slugify, pickAvatar, validateHandle, validateAvatar } from "@fjord/shared";
import { users } from "../src/db/schema.js";
import { resolveHandleCollision, backfillUserProfiles } from "../src/services/users.js";
import { makeTestApp } from "./helpers.js";

// ── unit tests (no HTTP) ────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases and replaces spaces with hyphens", () => {
    expect(slugify("Jane Wong")).toBe("jane-wong");
  });
  it("strips non-slug chars", () => {
    expect(slugify("Héllo Wörld!")).toBe("hllo-wrld");
  });
  it("collapses repeated hyphens", () => {
    expect(slugify("a--b")).toBe("a-b");
  });
  it("trims leading and trailing hyphens", () => {
    expect(slugify("-hello-")).toBe("hello");
  });
  it("truncates to 32 chars", () => {
    expect(slugify("a".repeat(50))).toHaveLength(32);
  });
  it("returns empty string for all-emoji input", () => {
    expect(slugify("🦄")).toBe("");
  });
});

describe("validateHandle", () => {
  it("lowercases valid handles", () => {
    const r = validateHandle("Jane");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("jane");
  });
  it("returns handle_invalid for spaces", () => {
    const r = validateHandle("has spaces");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("handle_invalid");
  });
  it("returns handle_reserved for reserved words", () => {
    const r = validateHandle("admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("handle_reserved");
  });
  it("accepts underscores and hyphens", () => {
    const r = validateHandle("jane_wong-2");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("jane_wong-2");
  });
});

describe("resolveHandleCollision", () => {
  it("returns candidate when not taken", () => {
    expect(resolveHandleCollision("jane", () => false)).toBe("jane");
  });
  it("appends -2 on collision", () => {
    const taken = new Set(["jane"]);
    expect(resolveHandleCollision("jane", (h) => taken.has(h))).toBe("jane-2");
  });
  it("increments suffix until free", () => {
    const taken = new Set(["jane", "jane-2", "jane-3"]);
    expect(resolveHandleCollision("jane", (h) => taken.has(h))).toBe("jane-4");
  });
  it("falls back to user when candidate is empty", () => {
    expect(resolveHandleCollision("", () => false)).toBe("user");
  });
  it("falls back to user when candidate is reserved", () => {
    expect(resolveHandleCollision("admin", () => false)).toBe("user");
  });
});

describe("validateAvatar", () => {
  it("accepts a single emoji", () => {
    const r = validateAvatar("🦊");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("🦊");
  });
  it("accepts https URLs", () => {
    const r = validateAvatar("https://example.com/a.png");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("https://example.com/a.png");
  });
  it("rejects plain ASCII", () => {
    const r = validateAvatar("abc");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("avatar_invalid");
  });
  it("rejects non-http URLs", () => {
    const r = validateAvatar("javascript:alert(1)");
    expect(r.ok).toBe(false);
  });
  it("rejects URL over 2048 chars", () => {
    const r = validateAvatar("https://x.com/" + "a".repeat(2040));
    expect(r.ok).toBe(false);
  });
  it("rejects multi-emoji strings", () => {
    const r = validateAvatar("🦊🦁");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("avatar_invalid");
  });
  it("rejects empty string", () => {
    const r = validateAvatar("");
    expect(r.ok).toBe(false);
  });
});

describe("backfillUserProfiles", () => {
  function makeHandle(sqlite: DatabaseSync) {
    const db = drizzle({ client: sqlite });
    return { db, sqlite, close: () => sqlite.close() } as any;
  }

  it("fills handle and avatar for a user with display_name 'Jane Wong'", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      handle TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar TEXT,
      token_hash TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    )`);
    sqlite.exec(`INSERT INTO users (id, display_name, kind, created_at) VALUES ('u1', 'Jane Wong', 'human', '2025-01-01T00:00:00Z')`);

    const dbHandle = makeHandle(sqlite);
    backfillUserProfiles(dbHandle);

    const row = sqlite.prepare("SELECT handle, avatar FROM users WHERE id = 'u1'").get() as any;
    expect(row.handle).toBe("jane-wong");
    expect(row.avatar).toBeTruthy();
    expect(typeof row.avatar).toBe("string");
    sqlite.close();
  });

  it("resolves collision: second 'Jane Wong' gets 'jane-wong-2'", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      handle TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar TEXT,
      token_hash TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    )`);
    sqlite.exec(`INSERT INTO users (id, display_name, kind, created_at) VALUES
      ('u1', 'Jane Wong', 'human', '2025-01-01T00:00:00Z'),
      ('u2', 'Jane Wong', 'human', '2025-01-01T00:00:01Z')`);

    const dbHandle = makeHandle(sqlite);
    backfillUserProfiles(dbHandle);

    const rows = sqlite.prepare("SELECT id, handle FROM users ORDER BY id").all() as any[];
    const handles = rows.map((r) => r.handle);
    expect(handles).toContain("jane-wong");
    expect(handles).toContain("jane-wong-2");
    sqlite.close();
  });

  it("falls back for all-emoji display_name", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      handle TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar TEXT,
      token_hash TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    )`);
    sqlite.exec(`INSERT INTO users (id, display_name, kind, created_at) VALUES ('u1', '🦄', 'human', '2025-01-01T00:00:00Z')`);

    const dbHandle = makeHandle(sqlite);
    backfillUserProfiles(dbHandle);

    const row = sqlite.prepare("SELECT handle FROM users WHERE id = 'u1'").get() as any;
    expect(row.handle).toBeTruthy();
    expect(row.handle).not.toBe("admin");
    sqlite.close();
  });

  it("does not produce reserved handle 'admin' for display_name 'Admin'", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      handle TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar TEXT,
      token_hash TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    )`);
    sqlite.exec(`INSERT INTO users (id, display_name, kind, created_at) VALUES ('u1', 'Admin', 'human', '2025-01-01T00:00:00Z')`);

    const dbHandle = makeHandle(sqlite);
    backfillUserProfiles(dbHandle);

    const row = sqlite.prepare("SELECT handle FROM users WHERE id = 'u1'").get() as any;
    expect(row.handle).not.toBe("admin");
    expect(row.handle).toBeTruthy();
    sqlite.close();
  });

  it("is idempotent — calling twice does not change handles", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec(`CREATE TABLE users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      handle TEXT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar TEXT,
      token_hash TEXT,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    )`);
    sqlite.exec(`INSERT INTO users (id, display_name, kind, created_at) VALUES ('u1', 'Jane Wong', 'human', '2025-01-01T00:00:00Z')`);

    const dbHandle = makeHandle(sqlite);
    backfillUserProfiles(dbHandle);
    const first = (sqlite.prepare("SELECT handle, avatar FROM users WHERE id = 'u1'").get() as any);
    backfillUserProfiles(dbHandle);
    const second = (sqlite.prepare("SELECT handle, avatar FROM users WHERE id = 'u1'").get() as any);
    expect(second.handle).toBe(first.handle);
    expect(second.avatar).toBe(first.avatar);
    sqlite.close();
  });
});

// ── HTTP integration tests ──────────────────────────────────────────────────

describe("users", () => {
  let ctx: Awaited<ReturnType<typeof makeTestApp>>;
  beforeEach(async () => {
    ctx = await makeTestApp();
  });
  afterEach(async () => {
    await ctx.close();
  });

  it("lists seeded users", async () => {
    const res = await ctx.inject({ method: "GET", url: "/api/users" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.map((u: any) => u.id).sort();
    expect(ids).toContain("alice");
    expect(ids).toContain("agent-coder");
    expect(ids).toContain("default-administrator");
  });

  it("GET /api/users returns new fields and never exposes credential hashes", async () => {
    const res = await ctx.inject({ method: "GET", url: "/api/users" });
    const [user] = res.json();
    expect(user).toHaveProperty("handle");
    expect(user).toHaveProperty("title");
    expect(user).toHaveProperty("bio");
    expect(user).toHaveProperty("avatar");
    expect(user).not.toHaveProperty("password_hash");
    expect(user).not.toHaveProperty("token_hash");
  });

  it("GET /api/users/:id returns new fields and never exposes credential hashes", async () => {
    const res = await ctx.inject({ method: "GET", url: "/api/users/alice" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty("handle");
    expect(body).toHaveProperty("title");
    expect(body).toHaveProperty("bio");
    expect(body).toHaveProperty("avatar");
    expect(body).not.toHaveProperty("password_hash");
    expect(body).not.toHaveProperty("token_hash");
  });

  it("creates a new user", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBe("bob");
  });

  it("POST derives handle from display_name when not provided", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob Jones", kind: "human" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().handle).toBe("bob-jones");
  });

  it("POST picks deterministic avatar from id when not provided", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "testuser", display_name: "Test", kind: "human" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().avatar).toBe(pickAvatar("testuser"));
  });

  it("POST accepts explicit handle and lowercases it", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human", handle: "BobHandle" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().handle).toBe("bobhandle");
  });

  it("POST rejects reserved handle", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human", handle: "admin" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("handle_reserved");
  });

  it("POST rejects handle with spaces", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human", handle: "has spaces" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("handle_invalid");
  });

  it("POST rejects duplicate handle (case-insensitive)", async () => {
    // alice already has handle "alice"
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human", handle: "ALICE" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("handle_taken");
  });

  it("POST rejects multi-emoji avatar with avatar_invalid", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human", avatar: "🦊🦁" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("avatar_invalid");
  });

  it("POST rejects avatar with javascript: scheme", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human", avatar: "javascript:alert(1)" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST rejects plain ASCII avatar", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human", avatar: "abc" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("POST accepts emoji avatar", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human", avatar: "🦊" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().avatar).toBe("🦊");
  });

  it("POST accepts https URL avatar", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human", avatar: "https://example.com/a.png" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().avatar).toBe("https://example.com/a.png");
  });

  it("POST does not accept password_hash in the request body (additionalProperties:false)", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human", password_hash: "anything" } as any,
    });
    // Either the field is silently dropped or the schema rejects it; the response must not echo it back.
    if (res.statusCode === 201) {
      expect(res.json()).not.toHaveProperty("password_hash");
    } else {
      expect(res.statusCode).toBe(400);
    }
  });

  it("POST response includes handle, title, bio, avatar", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty("handle");
    expect(body).toHaveProperty("title");
    expect(body).toHaveProperty("bio");
    expect(body).toHaveProperty("avatar");
  });

  it("rejects duplicate user creation", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "alice", display_name: "Alice", kind: "human" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects invalid user kind", async () => {
    const res = await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "x", display_name: "X", kind: "robot" },
    });
    expect(res.statusCode).toBe(400);
  });

  // PATCH tests
  it("PATCH display_name works without touching other fields", async () => {
    const before = await ctx.inject({ method: "GET", url: "/api/users/alice" });
    const originalHandle = before.json().handle;

    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { display_name: "Alice Updated" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().display_name).toBe("Alice Updated");
    expect(res.json().handle).toBe(originalHandle);
  });

  it("PATCH handle to a valid new value works and is lowercased", async () => {
    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { handle: "AliceNew" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().handle).toBe("alicenew");
  });

  it("PATCH handle to a reserved word returns 400", async () => {
    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { handle: "admin" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH handle to another user's handle returns 409", async () => {
    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { handle: "agent-coder" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("PATCH handle to its own current handle is a no-op and succeeds", async () => {
    const before = await ctx.inject({ method: "GET", url: "/api/users/alice" });
    const currentHandle = before.json().handle;

    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { handle: currentHandle },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().handle).toBe(currentHandle);
  });

  it("PATCH ignores extra 'id' field — user id cannot change", async () => {
    // additionalProperties: false strips unknown fields; the empty body is a no-op
    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { display_name: "Alice Hacked", id: "hacked" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBe("alice");
  });

  it("PATCH kind from human to agent succeeds", async () => {
    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { kind: "agent" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().kind).toBe("agent");
  });

  it("PATCH avatar validates URL scheme", async () => {
    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { avatar: "ftp://bad.com/a.png" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("PATCH avatar with valid emoji succeeds", async () => {
    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { avatar: "🎵" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().avatar).toBe("🎵");
  });

  it("PATCH password_hash: null requires admin and another user (not self)", async () => {
    // alice is acting as herself — cannot reset her own password via this route
    const self = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { password_hash: null },
    });
    expect(self.statusCode).toBe(400);

    // Add bob as a target
    await ctx.inject({
      method: "POST",
      url: "/api/users",
      payload: { id: "bob", display_name: "Bob", kind: "human" },
    });
    const ok = await ctx.inject({
      method: "PATCH",
      url: "/api/users/bob",
      payload: { password_hash: null },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).not.toHaveProperty("password_hash");
  });

  it("PATCH nonexistent user returns 404", async () => {
    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/nobody",
      payload: { display_name: "Ghost" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("PATCH response excludes credential hashes", async () => {
    const res = await ctx.inject({
      method: "PATCH",
      url: "/api/users/alice",
      payload: { title: "Engineer" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).not.toHaveProperty("password_hash");
    expect(res.json()).not.toHaveProperty("token_hash");
  });

  // ── soft delete (ADR-0004) ────────────────────────────────────────────────

  describe("soft delete", () => {
    it("DELETE returns 204 and marks the user deleted_at", async () => {
      const before = await ctx.inject({ method: "GET", url: "/api/users/alice" });
      expect(before.json().deleted_at).toBeNull();

      const del = await ctx.inject({ method: "DELETE", url: "/api/users/alice" });
      expect(del.statusCode).toBe(204);

      // Use default-administrator since alice is now deleted
      const after = await ctx.inject({ method: "GET", url: "/api/users/alice", headers: { "x-user-id": "default-administrator" } });
      expect(after.statusCode).toBe(200);
      expect(typeof after.json().deleted_at).toBe("string");
    });

    it("DELETE is idempotent — second call still returns 204 and leaves deleted_at unchanged", async () => {
      const first = await ctx.inject({ method: "DELETE", url: "/api/users/alice" });
      expect(first.statusCode).toBe(204);
      const stamp = (await ctx.inject({ method: "GET", url: "/api/users/alice", headers: { "x-user-id": "default-administrator" } })).json()
        .deleted_at;
      const second = await ctx.inject({ method: "DELETE", url: "/api/users/alice", headers: { "x-user-id": "default-administrator" } });
      expect(second.statusCode).toBe(204);
      const stamp2 = (await ctx.inject({ method: "GET", url: "/api/users/alice", headers: { "x-user-id": "default-administrator" } })).json()
        .deleted_at;
      expect(stamp2).toBe(stamp);
    });

    it("DELETE returns 404 when the id does not exist", async () => {
      const res = await ctx.inject({ method: "DELETE", url: "/api/users/nobody" });
      expect(res.statusCode).toBe(404);
    });

    it("DELETE succeeds even when the user has reported tasks (no FK error)", async () => {
      const create = await ctx.inject({
        method: "POST",
        url: "/api/tasks",
        headers: { "x-user-id": "alice" },
        payload: { title: "alice's task" },
      });
      expect(create.statusCode).toBe(201);

      const del = await ctx.inject({ method: "DELETE", url: "/api/users/alice" });
      expect(del.statusCode).toBe(204);

      const after = await ctx.inject({ method: "GET", url: "/api/users/alice", headers: { "x-user-id": "default-administrator" } });
      expect(typeof after.json().deleted_at).toBe("string");
    });

    it("GET /api/users still includes deleted users (clients filter)", async () => {
      await ctx.inject({ method: "DELETE", url: "/api/users/alice" });
      const res = await ctx.inject({ method: "GET", url: "/api/users", headers: { "x-user-id": "default-administrator" } });
      const ids = res.json().map((u: any) => u.id);
      expect(ids).toContain("alice");
      const alice = res.json().find((u: any) => u.id === "alice");
      expect(typeof alice.deleted_at).toBe("string");
    });

    it("PATCH on a deleted user returns 404", async () => {
      await ctx.inject({ method: "DELETE", url: "/api/users/alice" });
      // Use admin actor since alice is now deleted
      const res = await ctx.inject({
        method: "PATCH",
        url: "/api/users/alice",
        headers: { "x-user-id": "default-administrator" },
        payload: { display_name: "Resurrected" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("handle stays reserved — POST with the deleted user's handle returns 409", async () => {
      await ctx.inject({ method: "DELETE", url: "/api/users/alice" });
      const res = await ctx.inject({
        method: "POST",
        url: "/api/users",
        headers: { "x-user-id": "default-administrator" },
        payload: { id: "alice2", display_name: "Alice II", kind: "human", handle: "alice" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("DELETE clears password_hash", async () => {
      // Set a known hash directly via DB
      ctx.app.db.update(users).set({ passwordHash: "scrypt$N=16384,r=8,p=1$abc$def" })
        .where(eq(users.id, "alice")).run();
      const before = ctx.app.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, "alice"))
        .get();
      expect(before?.passwordHash).toBe("scrypt$N=16384,r=8,p=1$abc$def");

      await ctx.inject({ method: "DELETE", url: "/api/users/alice", headers: { "x-user-id": "default-administrator" } });
      const after = ctx.app.db
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, "alice"))
        .get();
      expect(after?.passwordHash).toBeNull();
    });
  });
});
