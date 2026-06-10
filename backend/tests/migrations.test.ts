import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import { slugify } from "@fjord/shared";
import { backfillUserProfiles } from "../src/services/users.js";
import { openDatabase, runMigrations, applyMigrations, repairSchemaDrift } from "../src/db/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

// All migration tags in lexical order, which is also application order. Derived
// from the folder so newly added migrations are picked up automatically.
const allTags = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.replace(/\.sql$/, ""))
  .sort();

function applyMigration(sqlite: DatabaseSync, tag: string): void {
  const sql = readFileSync(join(migrationsDir, `${tag}.sql`), "utf-8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) sqlite.exec(stmt);
}

describe("migration 0004_spaces", () => {
  it("creates the default space and backfills existing rows", () => {
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });

    applyMigration(sqlite, "0000_initial");
    applyMigration(sqlite, "0001_projects_and_tags");
    applyMigration(sqlite, "0002_confused_the_watchers");
    applyMigration(sqlite, "0003_task_journal");

    sqlite.exec(`
      INSERT INTO users (id, display_name, kind, created_at)
        VALUES ('alice', 'Alice', 'human', '2025-01-01T00:00:00Z');
      INSERT INTO projects (id, name, color, description, due_at, created_at)
        VALUES ('p1', 'Project One', '#fff', '', NULL, '2025-01-01T00:00:00Z');
      INSERT INTO tasks (id, title, description, "column", position, reported_by, assigned_to, due_at, project_id, tags, created_at, updated_at, version, archived, archived_at)
        VALUES ('t-in-project', 'Task In Project', '', 'Backlog', 1.0, 'alice', NULL, NULL, 'p1', '[]', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 1, 0, NULL);
      INSERT INTO tasks (id, title, description, "column", position, reported_by, assigned_to, due_at, project_id, tags, created_at, updated_at, version, archived, archived_at)
        VALUES ('t-no-project', 'Task No Project', '', 'Backlog', 2.0, 'alice', NULL, NULL, NULL, '[]', '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z', 1, 0, NULL);
    `);

    applyMigration(sqlite, "0004_spaces");

    const space = sqlite
      .prepare("SELECT id, name, description, archived_at FROM spaces WHERE id = ?")
      .get("default") as { id: string; name: string; description: string; archived_at: string | null };
    expect(space).toEqual({
      id: "default",
      name: "Default",
      description: "",
      archived_at: null,
    });

    const project = sqlite
      .prepare("SELECT space_id FROM projects WHERE id = ?")
      .get("p1") as { space_id: string };
    expect(project.space_id).toBe("default");

    const tInProj = sqlite
      .prepare("SELECT space_id FROM tasks WHERE id = ?")
      .get("t-in-project") as { space_id: string };
    expect(tInProj.space_id).toBe("default");

    const tNoProj = sqlite
      .prepare("SELECT space_id FROM tasks WHERE id = ?")
      .get("t-no-project") as { space_id: string };
    expect(tNoProj.space_id).toBe("default");

    sqlite.exec(`
      INSERT INTO projects (id, name, color, description, due_at, created_at)
        VALUES ('p-new', 'New Project', '#aaa', '', NULL, '2025-01-02T00:00:00Z');
      INSERT INTO tasks (id, title, description, "column", position, reported_by, assigned_to, due_at, project_id, tags, created_at, updated_at, version, archived, archived_at)
        VALUES ('t-new', 'New Task', '', 'Backlog', 3.0, 'alice', NULL, NULL, 'p-new', '[]', '2025-01-02T00:00:00Z', '2025-01-02T00:00:00Z', 1, 0, NULL);
    `);
    const newProj = sqlite
      .prepare("SELECT space_id FROM projects WHERE id = ?")
      .get("p-new") as { space_id: string };
    const newTask = sqlite
      .prepare("SELECT space_id FROM tasks WHERE id = ?")
      .get("t-new") as { space_id: string };
    expect(newProj.space_id).toBe("default");
    expect(newTask.space_id).toBe("default");

    sqlite.close();
  });
});

describe("migration 0005_user_profile", () => {
  it("adds profile columns and backfill populates handle and avatar for pre-existing users", () => {
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });

    applyMigration(sqlite, "0000_initial");
    applyMigration(sqlite, "0001_projects_and_tags");
    applyMigration(sqlite, "0002_confused_the_watchers");
    applyMigration(sqlite, "0003_task_journal");
    applyMigration(sqlite, "0004_spaces");

    // Insert a user the old way (no handle/avatar)
    sqlite.exec(`
      INSERT INTO users (id, display_name, kind, created_at)
        VALUES ('alice', 'Alice', 'human', '2025-01-01T00:00:00Z');
    `);

    applyMigration(sqlite, "0005_user_profile");
    applyMigration(sqlite, "0006_typical_giant_man");

    // handle and avatar should be NULL before backfill
    const before = sqlite.prepare("SELECT handle, avatar FROM users WHERE id = 'alice'").get() as any;
    expect(before.handle).toBeNull();
    expect(before.avatar).toBeNull();

    // Run backfill
    const db = drizzle({ client: sqlite });
    const dbHandle = { db, sqlite, close: () => sqlite.close() } as any;
    backfillUserProfiles(dbHandle);

    const after = sqlite.prepare("SELECT handle, avatar FROM users WHERE id = 'alice'").get() as any;
    expect(after.handle).toBe("alice");
    expect(after.avatar).toBeTruthy();

    sqlite.close();
  });

  it("seeded users via FJORD_SEED_USERS have handle equal to slugified id", async () => {
    const { makeTestApp } = await import("./helpers.js");
    const ctx = await makeTestApp();
    const res = await ctx.inject({ method: "GET", url: "/api/users" });
    const users = res.json() as Array<{ id: string; handle: string }>;
    for (const u of users) {
      // The default-administrator user has handle "admin" (reserved) - skip it
      if (u.id === "default-administrator") continue;
      expect(u.handle).toBe(slugify(u.id));
    }
    await ctx.close();
  });
});

describe("migration 0007_dizzy_komodo", () => {
  it("backfills existing users to Admin role", () => {
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });

    applyMigration(sqlite, "0000_initial");
    applyMigration(sqlite, "0001_projects_and_tags");
    applyMigration(sqlite, "0002_confused_the_watchers");
    applyMigration(sqlite, "0003_task_journal");
    applyMigration(sqlite, "0004_spaces");
    applyMigration(sqlite, "0005_user_profile");
    applyMigration(sqlite, "0006_typical_giant_man");

    sqlite.exec(`
      INSERT INTO users (id, display_name, handle, kind, title, bio, avatar, token_hash, created_at, deleted_at)
        VALUES
          ('alice', 'Alice', 'alice', 'human', '', '', '🦊', NULL, '2025-01-01T00:00:00Z', NULL),
          ('bob', 'Bob', 'bob', 'human', '', '', '🦁', NULL, '2025-01-01T00:00:01Z', NULL);
    `);

    applyMigration(sqlite, "0007_dizzy_komodo");

    const alice = sqlite.prepare("SELECT role FROM users WHERE id = 'alice'").get() as any;
    const bob = sqlite.prepare("SELECT role FROM users WHERE id = 'bob'").get() as any;
    expect(alice.role).toBe("Admin");
    expect(bob.role).toBe("Admin");

    sqlite.close();
  });

  it("backfills existing spaces with created_by = default-administrator", () => {
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });

    applyMigration(sqlite, "0000_initial");
    applyMigration(sqlite, "0001_projects_and_tags");
    applyMigration(sqlite, "0002_confused_the_watchers");
    applyMigration(sqlite, "0003_task_journal");
    applyMigration(sqlite, "0004_spaces");
    applyMigration(sqlite, "0005_user_profile");
    applyMigration(sqlite, "0006_typical_giant_man");

    // The default space was inserted by migration 0004
    applyMigration(sqlite, "0007_dizzy_komodo");

    const space = sqlite.prepare("SELECT created_by FROM spaces WHERE id = 'default'").get() as any;
    expect(space.created_by).toBe("default-administrator");

    sqlite.close();
  });

  it("new users default to Member role", () => {
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });

    applyMigration(sqlite, "0000_initial");
    applyMigration(sqlite, "0001_projects_and_tags");
    applyMigration(sqlite, "0002_confused_the_watchers");
    applyMigration(sqlite, "0003_task_journal");
    applyMigration(sqlite, "0004_spaces");
    applyMigration(sqlite, "0005_user_profile");
    applyMigration(sqlite, "0006_typical_giant_man");
    applyMigration(sqlite, "0007_dizzy_komodo");

    sqlite.exec(`
      INSERT INTO users (id, display_name, handle, kind, title, bio, avatar, token_hash, created_at, deleted_at)
        VALUES ('newuser', 'New User', 'newuser', 'human', '', '', '🦊', NULL, '2025-02-01T00:00:00Z', NULL);
    `);

    const row = sqlite.prepare("SELECT role FROM users WHERE id = 'newuser'").get() as any;
    expect(row.role).toBe("Member");

    sqlite.close();
  });
});

describe("runMigrations integration", () => {
  const journalEntries = JSON.parse(
    readFileSync(join(migrationsDir, "meta", "_journal.json"), "utf-8"),
  ).entries as { when: number; tag: string }[];

  it("fresh database: applies all migrations and populates __fjord_migrations", () => {
    const handle = openDatabase(":memory:");
    runMigrations(handle);

    const rows = handle.sqlite
      .prepare("SELECT tag FROM __fjord_migrations ORDER BY tag")
      .all() as { tag: string }[];
    expect(rows.map((r) => r.tag)).toEqual(allTags);

    const usersTable = handle.sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'")
      .get();
    expect(usersTable).toBeTruthy();

    handle.close();
  });

  it("fresh database: running twice is idempotent", () => {
    const handle = openDatabase(":memory:");
    runMigrations(handle);
    runMigrations(handle);

    const rows = handle.sqlite
      .prepare("SELECT tag FROM __fjord_migrations ORDER BY tag")
      .all() as { tag: string }[];
    expect(rows.map((r) => r.tag)).toEqual(allTags);

    handle.close();
  });

  it("upgraded database: backfills from __drizzle_migrations and does not replay", () => {
    const handle = openDatabase(":memory:");

    for (const tag of allTags) applyMigration(handle.sqlite, tag);

    handle.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at NUMERIC
      )
    `);
    for (const entry of journalEntries) {
      handle.sqlite
        .prepare("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
        .run(entry.tag, entry.when);
    }

    runMigrations(handle);

    const rows = handle.sqlite
      .prepare("SELECT tag FROM __fjord_migrations ORDER BY tag")
      .all() as { tag: string }[];
    expect(rows.map((r) => r.tag)).toEqual(allTags);

    handle.close();
  });

  it("upgraded database with missing journal: throws instead of silently replaying", () => {
    const tmpDir = join(migrationsDir, "..", ".tmp-test-no-journal");
    try {
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(join(tmpDir, "0000_test.sql"), "CREATE TABLE test_table (id TEXT PRIMARY KEY)");

      const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
      sqlite.exec("PRAGMA journal_mode = WAL");
      sqlite.exec("CREATE TABLE test_table (id TEXT PRIMARY KEY)");
      sqlite.exec(`
        CREATE TABLE __drizzle_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          hash TEXT NOT NULL,
          created_at NUMERIC
        )
      `);
      sqlite.exec("INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('test', 9999)");

      expect(() => applyMigrations(sqlite, tmpDir)).toThrow(
        /Cannot backfill legacy migrations.*_journal\.json.*missing/,
      );

      sqlite.close();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("legacy __ak_migrations ledger: renames to __fjord_migrations and does not replay", () => {
    const handle = openDatabase(":memory:");

    // Simulate a pre-rename DB: schema fully applied, ledger under the OLD name
    // with a distinctive applied_at we can later prove was carried over verbatim.
    for (const tag of allTags) applyMigration(handle.sqlite, tag);
    handle.sqlite.exec(`
      CREATE TABLE __ak_migrations (
        tag TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
    const insert = handle.sqlite.prepare(
      "INSERT INTO __ak_migrations (tag, applied_at) VALUES (?, ?)",
    );
    for (const tag of allTags) insert.run(tag, "2020-01-01T00:00:00Z");

    // Boot must not throw — a replay against populated tables would crash.
    expect(() => runMigrations(handle)).not.toThrow();

    // (a) the new ledger holds exactly the same tags
    const rows = handle.sqlite
      .prepare("SELECT tag FROM __fjord_migrations ORDER BY tag")
      .all() as { tag: string }[];
    expect(rows.map((r) => r.tag)).toEqual(allTags);

    // (b) the old ledger is gone (renamed, not duplicated)
    const oldLedger = handle.sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '__ak_migrations'")
      .get();
    expect(oldLedger).toBeFalsy();

    // (c) no replay: rows were carried over verbatim, not re-applied with fresh
    // timestamps (a re-apply would use the current ISO time, not our sentinel).
    const appliedAt = handle.sqlite
      .prepare("SELECT DISTINCT applied_at FROM __fjord_migrations")
      .all() as { applied_at: string }[];
    expect(appliedAt).toEqual([{ applied_at: "2020-01-01T00:00:00Z" }]);

    handle.close();
  });
});

describe("schema drift repair", () => {
  it("restores role/auth objects when migration metadata got ahead of schema", () => {
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });

    applyMigration(sqlite, "0000_initial");
    applyMigration(sqlite, "0001_projects_and_tags");
    applyMigration(sqlite, "0002_confused_the_watchers");
    applyMigration(sqlite, "0003_task_journal");
    applyMigration(sqlite, "0004_spaces");
    applyMigration(sqlite, "0005_user_profile");
    applyMigration(sqlite, "0006_typical_giant_man");

    repairSchemaDrift(sqlite);

    const roleColumn = sqlite
      .prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'role'")
      .get() as { 1: number } | undefined;
    const passwordHashColumn = sqlite
      .prepare("SELECT 1 FROM pragma_table_info('users') WHERE name = 'password_hash'")
      .get() as { 1: number } | undefined;
    const spaceCreatedByColumn = sqlite
      .prepare("SELECT 1 FROM pragma_table_info('spaces') WHERE name = 'created_by'")
      .get() as { 1: number } | undefined;
    const userSpaceAccessTable = sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user_space_access'")
      .get() as { 1: number } | undefined;
    const sessionsTable = sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
      .get() as { 1: number } | undefined;
    const apiTokensTable = sqlite
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'api_tokens'")
      .get() as { 1: number } | undefined;

    expect(roleColumn).toBeTruthy();
    expect(passwordHashColumn).toBeTruthy();
    expect(spaceCreatedByColumn).toBeTruthy();
    expect(userSpaceAccessTable).toBeTruthy();
    expect(sessionsTable).toBeTruthy();
    expect(apiTokensTable).toBeTruthy();

    sqlite.close();
  });
});

// Regression coverage for the startup crash described in issue #107: when
// repairSchemaDrift creates objects that a not-yet-tracked migration also
// creates, a later migration run must not collide with them.
//
// The fix has two complementary halves and these tests pin down both:
//   (a) repairSchemaDrift records 0007/0008 in the ledger when it stands in for
//       them, so the runner skips those migrations next boot; and
//   (b) the CREATE TABLE/INDEX statements in 0007/0008 use IF NOT EXISTS, so
//       re-running them against pre-existing objects is harmless.
//
// Note on scope: SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, so the
// column-adding statements in 0007/0008 are *not* idempotent on their own. The
// ledger-marking half (a) is what protects them — once repair has added a column
// it claims the migration tag so the runner never re-applies that ADD COLUMN.
describe("migration safety across drift repair (issue #107)", () => {
  /** Apply every migration up to and including `lastTag`, in order. */
  function applyThrough(sqlite: DatabaseSync, lastTag: string): void {
    for (const tag of allTags) {
      applyMigration(sqlite, tag);
      if (tag === lastTag) return;
    }
    throw new Error(`unknown migration tag: ${lastTag}`);
  }

  /** Create the ledger and record `tags` as applied, mirroring applyMigrations. */
  function seedLedger(sqlite: DatabaseSync, tags: string[]): void {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS __fjord_migrations (
        tag TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);
    const insert = sqlite.prepare("INSERT INTO __fjord_migrations (tag, applied_at) VALUES (?, ?)");
    for (const tag of tags) insert.run(tag, "2025-01-01T00:00:00Z");
  }

  function ledgerTags(sqlite: DatabaseSync): string[] {
    return (
      sqlite.prepare("SELECT tag FROM __fjord_migrations ORDER BY tag").all() as { tag: string }[]
    ).map((r) => r.tag);
  }

  function hasColumn(sqlite: DatabaseSync, table: string, column: string): boolean {
    const rows = sqlite.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return rows.some((r) => r.name === column);
  }

  // The tags through 0006 — the schema state before role/auth was introduced.
  const through0006 = allTags.filter((t) => t <= "0006_typical_giant_man");

  it("repairSchemaDrift records the migrations it stands in for", () => {
    // A DB migrated only through 0006: its ledger knows nothing of 0007/0008.
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    applyThrough(sqlite, "0006_typical_giant_man");
    seedLedger(sqlite, through0006);

    repairSchemaDrift(sqlite);

    // Having created 0007/0008's objects, repair must also claim their tags so
    // the migration runner won't try to re-create them on the next startup.
    expect(ledgerTags(sqlite)).toEqual(
      expect.arrayContaining(["0007_dizzy_komodo", "0008_password_auth"]),
    );

    sqlite.close();
  });

  it("re-boots cleanly after an earlier startup's repair created the role/auth schema", () => {
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    applyThrough(sqlite, "0006_typical_giant_man");
    seedLedger(sqlite, through0006);

    // Earlier startup: repair detects the missing role/auth schema, creates it
    // (columns and tables), and marks 0007/0008 applied.
    repairSchemaDrift(sqlite);

    // Next startup: the runner must not replay 0007/0008 — a replay would crash
    // on `ALTER TABLE ... ADD COLUMN` for the already-present role/created_by/
    // password_hash columns — but must still apply anything newer (0009+).
    expect(() => {
      applyMigrations(sqlite, migrationsDir);
      repairSchemaDrift(sqlite);
    }).not.toThrow();

    expect(ledgerTags(sqlite)).toEqual(allTags);

    sqlite.close();
  });

  it("reconciles a partial repair where only the drift tables were pre-created", () => {
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    applyThrough(sqlite, "0006_typical_giant_man");
    seedLedger(sqlite, through0006);

    // Simulate a DB left behind by the pre-fix code: an older repair created the
    // new *tables* on a previous boot but never recorded 0007/0008 in the ledger.
    // The role/created_by/password_hash columns are still missing — those are
    // added by the migration, not by the table-creating part of repair.
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

    // Booting the fixed code must reconcile the half-applied state: CREATE TABLE
    // IF NOT EXISTS skips the pre-created tables while the ADD COLUMN statements
    // fill in the still-missing columns.
    expect(() => {
      applyMigrations(sqlite, migrationsDir);
      repairSchemaDrift(sqlite);
    }).not.toThrow();

    expect(ledgerTags(sqlite)).toEqual(allTags);
    expect(hasColumn(sqlite, "users", "role")).toBe(true);
    expect(hasColumn(sqlite, "users", "password_hash")).toBe(true);
    expect(hasColumn(sqlite, "spaces", "created_by")).toBe(true);

    sqlite.close();
  });

  it("re-running the CREATE statements in 0007/0008 is idempotent", () => {
    // The original crash was a bare `CREATE TABLE` in 0007/0008 colliding with a
    // table repair had already created. These are the only migrations whose
    // objects repairSchemaDrift also creates, so they're the only ones that can
    // collide — guard against a regression that drops the IF NOT EXISTS clauses.
    const sqlite = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
    for (const tag of allTags) applyMigration(sqlite, tag);

    for (const tag of ["0007_dizzy_komodo", "0008_password_auth"]) {
      const createStatements = readFileSync(join(migrationsDir, `${tag}.sql`), "utf-8")
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => /^create\b/i.test(s));
      // Guard against the filter silently matching nothing (e.g. a parser change).
      expect(createStatements.length).toBeGreaterThan(0);
      for (const stmt of createStatements) {
        expect(() => sqlite.exec(stmt)).not.toThrow();
      }
    }

    sqlite.close();
  });
});
