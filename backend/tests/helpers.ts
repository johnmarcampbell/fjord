import { isNull, eq } from "drizzle-orm";
import { buildApp } from "../src/server.js";
import { openDatabase } from "../src/db/index.js";
import type { Config } from "../src/config.js";
import { users } from "../src/db/schema.js";
import { createSession, SESSION_COOKIE } from "../src/services/sessions.js";

export const DEFAULT_ACTOR = "alice";

/**
 * Sentinel password-hash for tests so the force-change-on-write gate doesn't fire.
 * Not used for verification — we never call /api/auth/login in helper-based tests.
 */
const TEST_PASSWORD_HASH = "scrypt$N=16384,r=8,p=1$dGVzdA==$dGVzdA==";

export async function makeTestApp(overrides: Partial<Config> = {}) {
  const config: Config = {
    nodeEnv: "test",
    port: 0,
    host: "127.0.0.1",
    dbPath: ":memory:",
    logLevel: "error",
    corsOrigins: null,
    seedUsers: [
      { id: "alice", kind: "human" },
      { id: "agent-coder", kind: "agent" },
    ],
    staticDir: null,
    bootstrapPassword: null,
    sessionIdleDays: 30,
    editWindowMinutes: 5,
    demo: false,
    demoResetMinutes: 10,
    ...overrides,
  };
  const dbHandle = openDatabase(":memory:");
  const { app } = await buildApp({ config, dbHandle });
  await app.ready();

  // Seed a sentinel password hash on every human user that doesn't have one.
  // This silences the "set_password_required" gate so test helpers can create
  // sessions and drive write endpoints directly. Tests that exercise the
  // passwordless-once flow (auth.test.ts) build their own apps or reset alice's
  // hash explicitly.
  dbHandle.db.update(users).set({ passwordHash: TEST_PASSWORD_HASH })
    .where(isNull(users.passwordHash))
    .run();

  const sessionCache = new Map<string, string>();
  function cookieFor(userId: string): string {
    // Ensure the target user has *some* password hash so the force-change gate
    // doesn't fire mid-test. Only set the sentinel if the row currently has no
    // hash — tests that exercise the password lifecycle install their own.
    const row = dbHandle.db
      .select({ passwordHash: users.passwordHash, kind: users.kind })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (row && row.kind === "human" && row.passwordHash === null) {
      dbHandle.db.update(users).set({ passwordHash: TEST_PASSWORD_HASH })
        .where(eq(users.id, userId))
        .run();
    }
    let id = sessionCache.get(userId);
    if (!id) {
      const created = createSession(app.db, userId, config.sessionIdleDays);
      id = created.id;
      sessionCache.set(userId, id);
    }
    return id;
  }

  return {
    app,
    /**
     * Convenience inject that:
     * - reads `x-user-id` from headers (defaults to alice), creates/reuses a session, attaches the cookie.
     * - drops `x-user-id` so the new auth middleware does not see it.
     * - adds the `X-Requested-With` CSRF header on write methods.
     */
    inject: (opts: Parameters<typeof app.inject>[0]) => {
      const o = typeof opts === "string" ? { url: opts } : { ...opts };
      if (!o.headers) o.headers = {};
      const headers = o.headers as Record<string, string>;
      const requestedActor = headers["x-user-id"] ?? DEFAULT_ACTOR;
      delete headers["x-user-id"];
      const sessionId = cookieFor(requestedActor);
      const cookieHeader = headers["cookie"];
      const cookiePart = `${SESSION_COOKIE}=${sessionId}`;
      headers["cookie"] = cookieHeader ? `${cookieHeader}; ${cookiePart}` : cookiePart;
      const method = (o.method ?? "GET").toString().toUpperCase();
      if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
        if (!headers["x-requested-with"]) headers["x-requested-with"] = "agentic-kanban";
      }
      return app.inject(o);
    },
    cookieFor,
    close: async () => {
      await app.close();
      dbHandle.close();
    },
  };
}
