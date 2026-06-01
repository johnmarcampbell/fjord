import { useRef, useState } from "react";
import { login, useInvalidateMe } from "../lib/auth.js";

export function LoginPage() {
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const handleRef = useRef<HTMLInputElement>(null);
  const invalidateMe = useInvalidateMe();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      await login({ handle: handle.trim(), password });
      await invalidateMe();
    } catch (err) {
      const e = err as { status?: number; message?: string };
      if (e.status === 401) setError("Invalid handle or password.");
      else if (e.status === 400) setError(e.message ?? "Invalid request.");
      else setError(e.message ?? "Login failed.");
      setPending(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-bold tracking-tight text-ink">Fjord</h1>
        <p className="mb-6 text-sm text-ink-subtle">Sign in to continue.</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Handle</span>
            <input
              ref={handleRef}
              type="text"
              autoFocus
              autoComplete="username"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="alice"
              className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder-ink-muted focus:border-border-focus focus:outline-none transition-colors"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder-ink-muted focus:border-border-focus focus:outline-none transition-colors"
            />
            <span className="text-[11px] text-ink-muted">
              First-time users with no password set can sign in by leaving this blank.
            </span>
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
