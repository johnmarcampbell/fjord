import type {
  AddBlockerRequest,
  AddCommentRequest,
  CreateTaskRequest,
  CreateUserRequest,
  Task,
  TaskEvent,
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
  headers.set("Content-Type", "application/json");
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
  listUsers: () => request<User[]>("/api/users"),
  createUser: (body: CreateUserRequest) =>
    request<User>("/api/users", { method: "POST", body: JSON.stringify(body) }),

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
};
