export const COLUMNS = [
  "Backlog",
  "To Do",
  "In Progress",
  "In Review",
  "Done",
] as const;

export type Column = (typeof COLUMNS)[number];

export type UserKind = "human" | "agent";

export interface User {
  id: string;
  display_name: string;
  kind: UserKind;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  description: string;
  due_at: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  column: Column;
  position: number;
  reported_by: string;
  assigned_to: string | null;
  due_at: string | null;
  project_id: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  version: number;
  blocked_by: string[];
  blocking: string[];
}

export type EventKind =
  | "comment"
  | "task_created"
  | "column_changed"
  | "assigned_to_changed"
  | "reported_by_changed"
  | "due_date_changed"
  | "blocker_added"
  | "blocker_removed"
  | "project_changed"
  | "tags_changed";

export interface TaskEvent {
  id: string;
  task_id: string;
  actor_id: string;
  kind: EventKind;
  created_at: string;
  body: string | null;
  from_value: string | null;
  to_value: string | null;
  blocker_id: string | null;
}

export interface CreateUserRequest {
  id: string;
  display_name: string;
  kind: UserKind;
}

export interface CreateProjectRequest {
  name: string;
  color?: string;
  description?: string;
  due_at?: string | null;
}

export interface UpdateProjectRequest {
  name?: string;
  color?: string;
  description?: string;
  due_at?: string | null;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  column?: Column;
  assigned_to?: string | null;
  due_at?: string | null;
  project_id?: string | null;
  tags?: string[];
}

export interface UpdateTaskRequest {
  version: number;
  title?: string;
  description?: string;
  column?: Column;
  position?: number;
  assigned_to?: string | null;
  due_at?: string | null;
  project_id?: string | null;
  tags?: string[];
}

export interface AddCommentRequest {
  body: string;
}

export interface AddBlockerRequest {
  blocker_id: string;
}

export type StreamEvent =
  | { type: "task.created"; task_id: string }
  | { type: "task.updated"; task_id: string; version: number }
  | { type: "task.deleted"; task_id: string }
  | { type: "task.event_added"; task_id: string; event_id: string };

export function isTaskBlocked(
  task: Pick<Task, "blocked_by">,
  taskById: Map<string, Pick<Task, "column">>,
): boolean {
  for (const blockerId of task.blocked_by) {
    const blocker = taskById.get(blockerId);
    if (blocker && blocker.column !== "Done") return true;
  }
  return false;
}
