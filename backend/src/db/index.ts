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
  repairSchemaDrift(handle.sqlite);
}

export * as schema from "./schema.js";

type TableInfoRow = { name: string };

function hasTable(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);
  return !!row;
}

function hasColumn(sqlite: Database.Database, tableName: string, columnName: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
  return rows.some((r) => r.name === columnName);
}

/**
 * Defensive repair for deployments whose migration metadata drifted from the
 * actual schema. This keeps startup resilient for older upgraded volumes.
 */
export function repairSchemaDrift(sqlite: Database.Database): void {
  const repair = sqlite.transaction(() => {
    if (hasTable(sqlite, "users") && !hasColumn(sqlite, "users", "role")) {
      sqlite.exec("ALTER TABLE `users` ADD `role` text DEFAULT 'Member' NOT NULL");
      sqlite.exec("UPDATE `users` SET `role` = 'Admin'");
    }

    if (hasTable(sqlite, "users") && !hasColumn(sqlite, "users", "password_hash")) {
      sqlite.exec("ALTER TABLE `users` ADD `password_hash` text");
    }

    if (hasTable(sqlite, "spaces") && !hasColumn(sqlite, "spaces", "created_by")) {
      sqlite.exec("ALTER TABLE `spaces` ADD `created_by` text DEFAULT 'default-administrator' NOT NULL");
    }

    if (!hasTable(sqlite, "user_space_access")) {
      sqlite.exec(`
        CREATE TABLE user_space_access (
          user_id text NOT NULL,
          space_id text NOT NULL,
          granted_at text NOT NULL,
          granted_by text NOT NULL,
          PRIMARY KEY(user_id, space_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade,
          FOREIGN KEY (space_id) REFERENCES spaces(id) ON UPDATE no action ON DELETE cascade,
          FOREIGN KEY (granted_by) REFERENCES users(id) ON UPDATE no action ON DELETE no action
        )
      `);
      sqlite.exec("CREATE INDEX user_space_access_user_idx ON user_space_access (user_id)");
    }

    if (!hasTable(sqlite, "sessions")) {
      sqlite.exec(`
        CREATE TABLE sessions (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL,
          created_at text NOT NULL,
          last_seen_at text NOT NULL,
          expires_at text NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )
      `);
      sqlite.exec("CREATE INDEX sessions_user_idx ON sessions (user_id)");
    }

    if (!hasTable(sqlite, "api_tokens")) {
      sqlite.exec(`
        CREATE TABLE api_tokens (
          id text PRIMARY KEY NOT NULL,
          user_id text NOT NULL,
          name text NOT NULL,
          lookup_hash text NOT NULL,
          token_hash text NOT NULL,
          preview text NOT NULL,
          created_at text NOT NULL,
          last_used_at text,
          expires_at text,
          revoked_at text,
          FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE no action ON DELETE cascade
        )
      `);
      sqlite.exec("CREATE UNIQUE INDEX api_tokens_lookup_hash_unique ON api_tokens (lookup_hash)");
      sqlite.exec("CREATE INDEX api_tokens_user_idx ON api_tokens (user_id)");
    }
  });

  repair();
}
