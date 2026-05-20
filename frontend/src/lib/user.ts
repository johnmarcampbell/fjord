import { DEFAULT_ADMINISTRATOR_ID } from "./policy.js";

const KEY = "kanban.current_user_id";

export function getCurrentUserId(): string {
  return localStorage.getItem(KEY) ?? DEFAULT_ADMINISTRATOR_ID;
}

export function setCurrentUserId(id: string | null): void {
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
}
