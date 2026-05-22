import { mkdirSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle, type NodeSQLiteDatabase } from "drizzle-orm/node-sqlite";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

export type DB = NodeSQLiteDatabase<typeof schema>;

export interface DBHandle {
  db: DB;
  sqlite: DatabaseSync;
  close: () => void;
}

export function openDatabase(dbPath: string): DBHandle {
  if (dbPath !== ":memory:") {
    const dir = dirname(dbPath);
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  const sqlite = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
  sqlite.exec("PRAGMA journal_mode = WAL");
  const db = drizzle({ client: sqlite, schema });
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
  applyMigrations(handle.sqlite, migrationsFolder);
  repairSchemaDrift(handle.sqlite);
}

export * as schema from "./schema.js";

type TableInfoRow = { name: string };

function hasTable(sqlite: DatabaseSync, tableName: string): boolean {
  const row = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
    .get(tableName);
  return !!row;
}

function hasColumn(sqlite: DatabaseSync, tableName: string, columnName: string): boolean {
  const rows = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];
  return rows.some((r) => r.name === columnName);
}

/**
 * Apply SQL migrations from `migrationsFolder`, tracking applied migrations in
 * a small bookkeeping table.
 *
 * Drizzle 1.0 RC changed both the on-disk migration layout (now one
 * `<timestamp>_<name>/migration.sql` per migration) and the runtime tracking
 * table (`__drizzle_migrations`). To avoid reformatting existing migrations and
 * to keep upgrade paths from older deployments simple, we read the legacy flat
 * `.sql` layout directly and track applied tags in our own table.
 *
 * On first run against a database that was previously migrated by Drizzle 0.45,
 * we backfill our tracking table from the existing `__drizzle_migrations` entries
 * by matching `created_at` against the legacy `meta/_journal.json`.
 */
function applyMigrations(sqlite: DatabaseSync, migrationsFolder: string): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __ak_migrations (
      tag TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    (sqlite.prepare("SELECT tag FROM __ak_migrations").all() as { tag: string }[]).map((r) => r.tag),
  );

  if (applied.size === 0 && hasTable(sqlite, "__drizzle_migrations")) {
    backfillFromDrizzleMigrations(sqlite, migrationsFolder, applied);
  }

  const files = readdirSync(migrationsFolder)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const tag = file.replace(/\.sql$/, "");
    if (applied.has(tag)) continue;

    const sql = readFileSync(join(migrationsFolder, file), "utf-8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    withTransaction(sqlite, () => {
      for (const stmt of statements) sqlite.exec(stmt);
      sqlite
        .prepare("INSERT INTO __ak_migrations (tag, applied_at) VALUES (?, ?)")
        .run(tag, new Date().toISOString());
    });
  }
}

function backfillFromDrizzleMigrations(
  sqlite: DatabaseSync,
  migrationsFolder: string,
  applied: Set<string>,
): void {
  const journalPath = join(migrationsFolder, "meta", "_journal.json");
  if (!existsSync(journalPath)) return;
  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  const byWhen = new Map(journal.entries.map((e) => [e.when, e.tag]));

  const rows = sqlite
    .prepare("SELECT created_at FROM __drizzle_migrations")
    .all() as { created_at: number | string }[];
  const insert = sqlite.prepare(
    "INSERT OR IGNORE INTO __ak_migrations (tag, applied_at) VALUES (?, ?)",
  );
  const now = new Date().toISOString();
  for (const row of rows) {
    const tag = byWhen.get(Number(row.created_at));
    if (tag) {
      insert.run(tag, now);
      applied.add(tag);
    }
  }
}

/**
 * Defensive repair for deployments whose migration metadata drifted from the
 * actual schema. This keeps startup resilient for older upgraded volumes.
 */
export function repairSchemaDrift(sqlite: DatabaseSync): void {
  withTransaction(sqlite, () => {
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
}

function withTransaction(db: DatabaseSync, fn: () => void): void {
  db.exec("BEGIN");
  try {
    fn();
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
