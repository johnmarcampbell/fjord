import { useEffect, useRef, useState } from "react";
import { getStoredToken, setStoredToken } from "../lib/auth.js";

type AuthStatus = "checking" | "open" | "needs-login" | "authenticated";

async function validateToken(token: string | null): Promise<AuthStatus> {
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const res = await fetch("/api/auth/validate", { headers });
    const body = await res.json() as { required: boolean; valid?: boolean };
    if (!body.required) return "open";
    if (res.ok) return "authenticated";
    return "needs-login";
  } catch {
    return "needs-login";
  }
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void validateToken(getStoredToken()).then(setStatus);

    function onLogout() {
      setStatus("needs-login");
      setInput("");
      setError("");
    }
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  useEffect(() => {
    if (status === "needs-login") inputRef.current?.focus();
  }, [status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const token = input.trim();
    if (!token) return;
    const next = await validateToken(token);
    if (next === "authenticated") {
      setStoredToken(token);
      setStatus("authenticated");
    } else {
      setError("Invalid token");
    }
  }

  if (status === "checking") {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="text-sm text-ink-subtle">Loading…</div>
      </div>
    );
  }

  if (status === "needs-login") {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-bold tracking-tight text-ink">Agentic Kanban</h1>
          <p className="mb-6 text-sm text-ink-subtle">Enter your access token to continue.</p>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              ref={inputRef}
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Access token"
              className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder-ink-muted focus:border-border-focus focus:outline-none transition-colors"
            />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
