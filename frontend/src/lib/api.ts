import type {
  AddBlockerRequest,
  AddCommentRequest,
  CreateProjectRequest,
  CreateTaskRequest,
  CreateUserRequest,
  Project,
  ServerConfig,
  Task,
  TaskEvent,
  UpdateProjectRequest,
  UpdateTaskRequest,
  User,
} from "@agentic-kanban/shared";
import { getCurrentUserId } from "./user.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { needsUser?: boolean } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  const userId = getCurrentUserId();
  if (userId) headers.set("X-User-Id", userId);
  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      (body && (body.error || body.message)) || `HTTP ${res.status}`;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export const api = {
  getConfig: () => request<ServerConfig>("/api/config"),

  listUsers: () => request<User[]>("/api/users"),
  createUser: (body: CreateUserRequest) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(body) }),

  listProjects: () => request<Project[]>("/api/projects"),
  createProject: (body: CreateProjectRequest) =>
    request<Project>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (id: string, body: UpdateProjectRequest) =>
    request<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  listTasks: () => request<Task[]>("/api/tasks"),
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

  listEvents: (taskId: string) =>
    request<TaskEvent[]>(`/api/tasks/${taskId}/events`),
  addComment: (taskId: string, body: AddCommentRequest) =>
    request<TaskEvent>(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

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
  listArchivedTasks: () =>
    request<Task[]>("/api/tasks?include_archived=true").then((tasks) =>
      tasks.filter((t) => t.archived),
    ),
};
