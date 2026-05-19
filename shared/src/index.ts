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
  handle: string;
  kind: UserKind;
  title: string;
  bio: string;
  avatar: string;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  description: string;
  due_at: string | null;
  created_at: string;
  space_id: string;
}

export const DEFAULT_SPACE_ID = "default";

export interface Space {
  id: string;
  name: string;
  description: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
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
  space_id: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  version: number;
  archived: boolean;
  archived_at: string | null;
  blocked_by: string[];
  blocking: string[];
  comment_count: number;
  journal_count: number;
}

export const EVENT_KINDS = [
  "comment",
  "journal_entry",
  "task_created",
  "column_changed",
  "assigned_to_changed",
  "reported_by_changed",
  "due_date_changed",
  "blocker_added",
  "blocker_removed",
  "project_changed",
  "space_changed",
  "tags_changed",
  "task_archived",
  "task_unarchived",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

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
  by_assignee: boolean;
}

export interface CreateUserRequest {
  id: string;
  display_name: string;
  kind: UserKind;
  handle?: string;
  title?: string;
  bio?: string;
  avatar?: string;
  token_hash?: string | null;
}

export interface UpdateUserRequest {
  display_name?: string;
  handle?: string;
  kind?: UserKind;
  title?: string;
  bio?: string;
  avatar?: string;
  token_hash?: string | null;
}

export const AVATAR_EMOJI_LIST = [
  "🦊", "🦁", "🐯", "🐼", "🐨",
  "🐮", "🐸", "🐵", "🐧", "🦉",
  "🦄", "🐙", "🦋", "🌸", "🌻",
  "🌈", "⭐", "🔥", "⚡", "🚀",
  "🎨", "🎯", "🧠", "💡", "☕",
  "🌊", "🍀", "🍄", "🎵", "🧩",
] as const;

export const RESERVED_HANDLES: readonly string[] = [
  "me", "admin", "system", "api", "app", "root",
  "support", "help", "agentic-kanban", "agent",
  "user", "users", "openclaw",
] as const;

export const HANDLE_REGEX = /^[a-z0-9_-]{1,32}$/;

export interface CreateProjectRequest {
  name: string;
  color?: string;
  description?: string;
  due_at?: string | null;
  space_id?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  color?: string;
  description?: string;
  due_at?: string | null;
  space_id?: string;
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  column?: Column;
  assigned_to?: string | null;
  due_at?: string | null;
  project_id?: string | null;
  space_id?: string;
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
  space_id?: string;
  tags?: string[];
}

export interface CreateSpaceRequest {
  name: string;
  description?: string;
}

export interface UpdateSpaceRequest {
  name?: string;
  description?: string;
}

export interface AddCommentRequest {
  body: string;
}

export interface AddJournalEntryRequest {
  body: string;
}

export interface AddBlockerRequest {
  blocker_id: string;
}

export type StreamEvent =
  | { type: "task.created"; task_id: string }
  | { type: "task.updated"; task_id: string; version: number }
  | { type: "task.deleted"; task_id: string }
  | { type: "task.event_added"; task_id: string; event_id: string; kind: EventKind }
  | { type: "demo.reset" };

export interface ServerConfig {
  demo: boolean;
  demo_reset_minutes: number | null;
}

export function isTaskBlocked(
  task: Pick<Task, "blocked_by">,
  taskById: Map<string, Pick<Task, "column" | "archived">>,
): boolean {
  for (const blockerId of task.blocked_by) {
    const blocker = taskById.get(blockerId);
    if (blocker && blocker.column !== "Done" && !blocker.archived) return true;
  }
  return false;
}
