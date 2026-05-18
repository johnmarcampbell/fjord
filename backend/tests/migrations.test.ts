import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

function applyMigration(sqlite: Database.Database, tag: string): void {
  const sql = readFileSync(join(migrationsDir, `${tag}.sql`), "utf-8");
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) sqlite.exec(stmt);
}

describe("migration 0004_spaces", () => {
  it("creates the default space and backfills existing rows", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");

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
