export const COLUMNS = [
  "Backlog",
  "To Do",
  "In Progress",
  "In Review",
  "Done",
] as const;

export type Column = (typeof COLUMNS)[number];

export type UserKind = "human" | "agent";

export type Role = "Admin" | "Member";

export interface User {
  id: string;
  display_name: string;
  handle: string;
  kind: UserKind;
  role: Role;
  title: string;
  bio: string;
  avatar: string;
  created_at: string;
  /**
   * ISO timestamp set when the user is soft-deleted. `null` for active users.
   * Deleted users continue to appear in `GET /api/users` so that historical
   * attribution on tasks and events still renders; clients should filter them
   * out of selection UIs.
   */
  deleted_at: string | null;
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
  created_by: string;
  /** True when the requesting actor explicitly owns or has been granted access to this space. */
  affiliated: boolean;
}

export interface Grant {
  user_id: string;
  space_id: string;
  granted_at: string;
  granted_by: string;
}

export interface CreateGrantRequest {
  user_id: string;
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
  updated_at: string | null;
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
  role?: Role;
  handle?: string;
  title?: string;
  bio?: string;
  avatar?: string;
}

export interface UpdateUserRequest {
  display_name?: string;
  handle?: string;
  kind?: UserKind;
  role?: Role;
  title?: string;
  bio?: string;
  avatar?: string;
  /** Admins may pass `null` to clear a user's password (force passwordless-once on next login). */
  password_hash?: null;
}

export interface ApiTokenSummary {
  id: string;
  user_id: string;
  name: string;
  preview: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
}

export interface CreateApiTokenRequest {
  name: string;
  expires_at?: string | null;
}

export interface CreateApiTokenResponse extends ApiTokenSummary {
  /** Plaintext token. Returned exactly once; never readable again. */
  token: string;
}

export interface LoginRequest {
  handle?: string;
  password?: string;
}

export interface AuthMe {
  id: string;
  display_name: string;
  handle: string;
  kind: UserKind;
  role: Role;
  avatar: string;
  requires_password_set: boolean;
}

export interface ChangePasswordRequest {
  current_password?: string;
  new_password: string;
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

export const DEFAULT_ADMINISTRATOR_ID = "default-administrator";

export const DOMAIN_ERROR_CODES = [
  "handle_invalid",
  "handle_reserved",
  "handle_taken",
  "avatar_invalid",
  "set_password_required",
  "version_conflict",
  "subsequent_activity",
  "edit_window_expired",
] as const;
export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

export type Validated<T, C extends DomainErrorCode> =
  | { ok: true; value: T }
  | { ok: false; code: C; message: string };

const RESERVED_HANDLE_SET = new Set(RESERVED_HANDLES.map((h) => h.toLowerCase()));

/**
 * Lowercase, collapse whitespace to `-`, strip non `[a-z0-9_-]` chars,
 * collapse repeated `-`, trim leading/trailing `-`, truncate to 32 chars.
 * Returns "" if nothing survives.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

/** Deterministic 32-bit hash — same string → same number. */
export function hashCode(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function pickAvatar(userId: string): string {
  return AVATAR_EMOJI_LIST[hashCode(userId) % AVATAR_EMOJI_LIST.length];
}

export function validateHandle(
  input: string,
): Validated<string, "handle_invalid" | "handle_reserved"> {
  const lower = input.toLowerCase();
  if (!HANDLE_REGEX.test(lower)) {
    return {
      ok: false,
      code: "handle_invalid",
      message: `Handle must match ${HANDLE_REGEX.source} (1-32 chars, lowercase letters, digits, _, -)`,
    };
  }
  if (RESERVED_HANDLE_SET.has(lower)) {
    return { ok: false, code: "handle_reserved", message: `Handle "${lower}" is reserved` };
  }
  return { ok: true, value: lower };
}

function countGraphemes(input: string): number {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let n = 0;
    for (const _ of seg.segment(input)) n++;
    return n;
  }
  let n = 0;
  for (const _ of input) n++;
  return n;
}

export function validateAvatar(input: string): Validated<string, "avatar_invalid"> {
  if (!input) {
    return { ok: false, code: "avatar_invalid", message: "Avatar is required" };
  }
  if (input.startsWith("http://") || input.startsWith("https://")) {
    if (input.length > 2048) {
      return { ok: false, code: "avatar_invalid", message: "Avatar URL too long (max 2048 chars)" };
    }
    return { ok: true, value: input };
  }
  let hasNonAscii = false;
  for (const ch of input) {
    if (ch.codePointAt(0)! > 127) {
      hasNonAscii = true;
      break;
    }
  }
  if (!hasNonAscii) {
    return { ok: false, code: "avatar_invalid", message: "Avatar must be an emoji or http(s) URL" };
  }
  if (countGraphemes(input) !== 1) {
    return { ok: false, code: "avatar_invalid", message: "Avatar must be a single emoji" };
  }
  return { ok: true, value: input };
}

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

export interface UpdateEventRequest {
  body: string;
}

export type StreamEvent =
  | { type: "task.created"; task_id: string; space_id: string }
  | { type: "task.updated"; task_id: string; version: number; space_id: string }
  | { type: "task.deleted"; task_id: string; space_id: string }
  | { type: "task.event_added"; task_id: string; event_id: string; kind: EventKind; space_id: string }
  | { type: "task.event_updated"; task_id: string; event_id: string; space_id: string }
  | { type: "task.event_deleted"; task_id: string; event_id: string; space_id: string }
  | { type: "demo.reset" };

export interface ServerConfig {
  demo: boolean;
  demo_reset_minutes: number | null;
}

export function canArchive(task: Pick<Task, "column" | "archived">): boolean {
  return task.column === "Done" && !task.archived;
}

export function isBlockerSatisfied(blocker: Pick<Task, "column" | "archived">): boolean {
  return blocker.column === "Done" || blocker.archived;
}

export function isTaskBlocked(
  task: Pick<Task, "blocked_by">,
  taskById: Map<string, Pick<Task, "column" | "archived">>,
): boolean {
  for (const blockerId of task.blocked_by) {
    const blocker = taskById.get(blockerId);
    if (blocker && !isBlockerSatisfied(blocker)) return true;
  }
  return false;
}
