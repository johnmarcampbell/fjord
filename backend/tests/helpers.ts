import { buildApp } from "../src/server.js";
import { openDatabase } from "../src/db/index.js";
import type { Config } from "../src/config.js";

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
  };
  const dbHandle = openDatabase(":memory:");
  const { app } = await buildApp({ config, dbHandle });
  await app.ready();
  return {
    app,
    close: async () => {
      await app.close();
      dbHandle.close();
    },
  };
}
