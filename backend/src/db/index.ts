import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import * as schema from "./schema.js";

export type DB = BetterSQLite3Database<typeof schema>;

export interface DBHandle {
  db: DB;
  sqlite: Database.Database;
  close: () => void;
}

export function openDatabase(dbPath: string): DBHandle {
  if (dbPath !== ":memory:") {
    const dir = dirname(dbPath);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return {
    db,
    sqlite,
    close: () => sqlite.close(),
  };
}

export function runMigrations(handle: DBHandle): void {
  const here = dirname(fileURLToPath(import.meta.url));
  // In dev (tsx): src/db -> ../../migrations. In build (dist/db): dist/db -> ../../migrations.
  const migrationsFolder = join(here, "..", "..", "migrations");
  migrate(handle.db, { migrationsFolder });
}

export * as schema from "./schema.js";
