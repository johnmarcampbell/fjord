import { eq } from "drizzle-orm";
import { openDatabase, runMigrations } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import { DEFAULT_ADMINISTRATOR_ID } from "@agentic-kanban/shared";

const dbPath = process.env.KANBAN_DB_PATH ?? "./data/kanban.db";
const handle = openDatabase(dbPath);
try {
  runMigrations(handle);
  const row = handle.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, DEFAULT_ADMINISTRATOR_ID))
    .get();
  if (!row) {
    console.error(`No default-administrator user in ${dbPath}. Has the server been started against this database?`);
    process.exit(1);
  }
  handle.db.update(users).set({ passwordHash: null }).where(eq(users.id, DEFAULT_ADMINISTRATOR_ID)).run();
  handle.db.delete(sessions).where(eq(sessions.userId, DEFAULT_ADMINISTRATOR_ID)).run();
  console.log(`default-administrator password cleared at ${dbPath}.`);
  console.log("Restart the server (set KANBAN_BOOTSTRAP_PASSWORD to seed a known one)");
  console.log("or log in as 'admin' with no password to set a new one in the UI.");
} finally {
  handle.close();
}
