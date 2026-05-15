import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  kind: text("kind", { enum: ["human", "agent"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("#6366f1"),
  description: text("description").notNull().default(""),
  dueAt: text("due_at"),
  createdAt: text("created_at").notNull(),
});

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    column: text("column").notNull(),
    position: real("position").notNull(),
    reportedBy: text("reported_by").notNull().references(() => users.id),
    assignedTo: text("assigned_to").references(() => users.id),
    dueAt: text("due_at"),
    projectId: text("project_id").references(() => projects.id),
    tags: text("tags").notNull().default("[]"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(1),
  },
  (table) => ({
    columnIdx: index("tasks_column_idx").on(table.column),
  }),
);

export const taskEvents = sqliteTable(
  "task_events",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull().references(() => users.id),
    kind: text("kind").notNull(),
    createdAt: text("created_at").notNull(),
    body: text("body"),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    blockerId: text("blocker_id"),
  },
  (table) => ({
    taskIdx: index("task_events_task_idx").on(table.taskId, table.createdAt),
  }),
);

export const taskDependencies = sqliteTable(
  "task_dependencies",
  {
    blockerId: text("blocker_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    blockedId: text("blocked_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.blockerId, table.blockedId] }),
    blockedIdx: index("task_deps_blocked_idx").on(table.blockedId),
  }),
);
