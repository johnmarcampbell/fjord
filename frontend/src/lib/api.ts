import type {
  AddBlockerRequest,
  AddCommentRequest,
  AddJournalEntryRequest,
  ApiTokenSummary,
  CreateApiTokenRequest,
  CreateApiTokenResponse,
  CreateGrantRequest,
  CreateProjectRequest,
  CreateSpaceRequest,
  CreateTaskRequest,
  CreateUserRequest,
  EventKind,
  Grant,
  Project,
  ServerConfig,
  Space,
  Task,
  TaskEvent,
  UpdateEventRequest,
  UpdateProjectRequest,
  UpdateSpaceRequest,
  UpdateTaskRequest,
  UpdateUserRequest,
  User,
} from "@fjord/shared";
import { dispatchLogout } from "./auth.js";

const CSRF_HEADER = "X-Requested-With";
const CSRF_VALUE = "fjord";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

function isWriteMethod(method: string | undefined): boolean {
  const m = (method ?? "GET").toUpperCase();
  return m === "POST" || m === "PATCH" || m === "PUT" || m === "DELETE";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (isWriteMethod(init.method)) headers.set(CSRF_HEADER, CSRF_VALUE);
  const res = await fetch(path, { ...init, credentials: "include", headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401) {
      dispatchLogout();
    }
    const message = (body && (body.error || body.message)) || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export const api = {
  getConfig: () => request<ServerConfig>("/api/config"),

  listUsers: () => request<User[]>("/api/users"),
  createUser: (body: CreateUserRequest) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(body) }),
  updateUser: (id: string, body: UpdateUserRequest) =>
    request<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUser: (id: string) =>
    request<void>(`/api/users/${id}`, { method: "DELETE" }),

  resetUserPassword: (id: string) =>
    request<User>(`/api/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ password_hash: null }),
    }),

  listUserTokens: (userId: string, includeRevoked = false) => {
    const qs = includeRevoked ? "?include_revoked=true" : "";
    return request<ApiTokenSummary[]>(`/api/users/${userId}/tokens${qs}`);
  },
  createUserToken: (userId: string, body: CreateApiTokenRequest) =>
    request<CreateApiTokenResponse>(`/api/users/${userId}/tokens`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeUserToken: (userId: string, tokenId: string) =>
    request<void>(`/api/users/${userId}/tokens/${tokenId}`, { method: "DELETE" }),

  listProjects: (spaceId?: string) => {
    const qs = spaceId ? `?space_id=${encodeURIComponent(spaceId)}` : "";
    return request<Project[]>(`/api/projects${qs}`);
  },
  getProject: (id: string) => request<Project>(`/api/projects/${id}`),
  createProject: (body: CreateProjectRequest) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (id: string, body: UpdateProjectRequest) =>
    request<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  listSpaces: (opts: { includeArchived?: boolean } = {}) => {
    const qs = opts.includeArchived ? "?include_archived=true" : "";
    return request<Space[]>(`/api/spaces${qs}`);
  },
  getSpace: (id: string) => request<Space>(`/api/spaces/${id}`),
  createSpace: (body: CreateSpaceRequest) =>
    request<Space>("/api/spaces", { method: "POST", body: JSON.stringify(body) }),
  updateSpace: (id: string, body: UpdateSpaceRequest) =>
    request<Space>(`/api/spaces/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSpace: (id: string) =>
    request<void>(`/api/spaces/${id}`, { method: "DELETE" }),
  archiveSpace: (id: string) =>
    request<Space>(`/api/spaces/${id}/archive`, { method: "POST" }),
  unarchiveSpace: (id: string) =>
    request<Space>(`/api/spaces/${id}/unarchive`, { method: "POST" }),

  listSpaceAccess: (spaceId: string) =>
    request<Grant[]>(`/api/spaces/${spaceId}/access`),
  grantSpaceAccess: (spaceId: string, body: CreateGrantRequest) =>
    request<Grant>(`/api/spaces/${spaceId}/access`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  revokeSpaceAccess: (spaceId: string, userId: string) =>
    request<void>(`/api/spaces/${spaceId}/access/${userId}`, { method: "DELETE" }),

  listTasks: (spaceId?: string) => {
    const qs = spaceId ? `?space_id=${encodeURIComponent(spaceId)}` : "";
    return request<Task[]>(`/api/tasks${qs}`);
  },
  getTask: (id: string) => request<Task>(`/api/tasks/${id}`),
  createTask: (body: CreateTaskRequest) =>
    request<Task>("/api/tasks", { method: "POST", body: JSON.stringify(body) }),
  updateTask: (id: string, body: UpdateTaskRequest) =>
    request<Task>(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTask: (id: string) =>
    request<void>(`/api/tasks/${id}`, { method: "DELETE" }),

  listEvents: (taskId: string, kinds?: EventKind[]) => {
    const qs = kinds && kinds.length ? `?kind=${kinds.join(",")}` : "";
    return request<TaskEvent[]>(`/api/tasks/${taskId}/events${qs}`);
  },
  addComment: (taskId: string, body: AddCommentRequest) =>
    request<TaskEvent>(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  addJournalEntry: (taskId: string, body: AddJournalEntryRequest) =>
    request<TaskEvent>(`/api/tasks/${taskId}/journal`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateEvent: (taskId: string, eventId: string, body: UpdateEventRequest) =>
    request<TaskEvent>(`/api/tasks/${taskId}/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteEvent: (taskId: string, eventId: string) =>
    request<void>(`/api/tasks/${taskId}/events/${eventId}`, { method: "DELETE" }),

  addBlocker: (taskId: string, body: AddBlockerRequest) =>
    request<Task>(`/api/tasks/${taskId}/blockers`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  removeBlocker: (taskId: string, blockerId: string) =>
    request<void>(`/api/tasks/${taskId}/blockers/${blockerId}`, {
      method: "DELETE",
    }),

  archiveTask: (id: string) =>
    request<Task>(`/api/tasks/${id}/archive`, { method: "POST" }),
  unarchiveTask: (id: string) =>
    request<Task>(`/api/tasks/${id}/unarchive`, { method: "POST" }),
  listArchivedTasks: (spaceId?: string) => {
    const qs = spaceId
      ? `?include_archived=true&space_id=${encodeURIComponent(spaceId)}`
      : "?include_archived=true";
    return request<Task[]>(`/api/tasks${qs}`).then((tasks) => tasks.filter((t) => t.archived));
  },
};
