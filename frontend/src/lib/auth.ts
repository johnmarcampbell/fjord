import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthMe, LoginRequest } from "@agentic-kanban/shared";

const ME_KEY = ["auth", "me"] as const;

/** Fired by the API layer when a 401 is observed mid-session. */
export function dispatchLogout(): void {
  window.dispatchEvent(new CustomEvent("auth:logout"));
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: async (): Promise<AuthMe | null> => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as AuthMe;
    },
    retry: false,
  });
}

export function useInvalidateMe() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ME_KEY });
}

export async function login(body: LoginRequest): Promise<AuthMe> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Requested-With": "agentic-kanban" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      message = j?.error ?? message;
    } catch {
      /* noop */
    }
    const e: Error & { status?: number } = new Error(message);
    e.status = res.status;
    throw e;
  }
  const json = await res.json();
  return json.actor as AuthMe;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
    headers: { "X-Requested-With": "agentic-kanban" },
  });
}

export async function changePassword(body: { current_password?: string; new_password: string }): Promise<void> {
  const res = await fetch("/api/auth/change-password", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Requested-With": "agentic-kanban" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      message = j?.error ?? message;
    } catch {
      /* noop */
    }
    const e: Error & { status?: number } = new Error(message);
    e.status = res.status;
    throw e;
  }
}
