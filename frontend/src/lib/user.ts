const KEY = "kanban.current_user_id";

export function getCurrentUserId(): string | null {
  return localStorage.getItem(KEY);
}

export function setCurrentUserId(id: string | null): void {
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
}
