import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDatabase, runMigrations } from "../src/db/index.js";
import { taskDependencies, tasks, users } from "../src/db/schema.js";
import { wouldCreateCycle, nowIso } from "../src/services/tasks.js";

function seedTask(db: ReturnType<typeof openDatabase>["db"], id: string) {
  db.insert(tasks)
    .values({
      id,
      title: id,
      description: "",
      column: "Backlog",
      position: 0,
      reportedBy: "u",
      assignedTo: null,
      dueAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      version: 1,
    })
    .run();
}

describe("wouldCreateCycle", () => {
  let handle: ReturnType<typeof openDatabase>;
  beforeEach(() => {
    handle = openDatabase(":memory:");
    runMigrations(handle);
    handle.db
      .insert(users)
      .values({ id: "u", displayName: "u", kind: "human", createdAt: nowIso() })
      .run();
    seedTask(handle.db, "A");
    seedTask(handle.db, "B");
    seedTask(handle.db, "C");
  });
  afterEach(() => {
    handle.close();
  });

  it("flags self-edges as cycles", () => {
    expect(wouldCreateCycle(handle.db, "A", "A")).toBe(true);
  });

  it("returns false for the first edge between two tasks", () => {
    expect(wouldCreateCycle(handle.db, "A", "B")).toBe(false);
  });

  it("detects a 2-cycle", () => {
    handle.db.insert(taskDependencies).values({ blockerId: "A", blockedId: "B" }).run();
    expect(wouldCreateCycle(handle.db, "B", "A")).toBe(true);
  });

  it("detects a transitive 3-cycle", () => {
    handle.db.insert(taskDependencies).values({ blockerId: "A", blockedId: "B" }).run();
    handle.db.insert(taskDependencies).values({ blockerId: "B", blockedId: "C" }).run();
    expect(wouldCreateCycle(handle.db, "C", "A")).toBe(true);
  });

  it("allows non-cyclic additions in a chain", () => {
    handle.db.insert(taskDependencies).values({ blockerId: "A", blockedId: "B" }).run();
    expect(wouldCreateCycle(handle.db, "B", "C")).toBe(false);
  });
});
