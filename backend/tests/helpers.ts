import { buildApp } from "../src/server.js";
import { openDatabase } from "../src/db/index.js";
import type { Config } from "../src/config.js";

export const DEFAULT_ACTOR = "alice";

export async function makeTestApp() {
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
    demo: false,
    demoResetMinutes: 10,
  };
  const dbHandle = openDatabase(":memory:");
  const { app } = await buildApp({ config, dbHandle });
  await app.ready();
  return {
    app,
    /** Convenience inject that always includes the default actor header. */
    inject: (opts: Parameters<typeof app.inject>[0]) => {
      const o = typeof opts === "string" ? { url: opts } : { ...opts };
      if (!o.headers) o.headers = {};
      const headers = o.headers as Record<string, string>;
      if (!headers["x-user-id"]) headers["x-user-id"] = DEFAULT_ACTOR;
      return app.inject(o);
    },
    close: async () => {
      await app.close();
      dbHandle.close();
    },
  };
}
