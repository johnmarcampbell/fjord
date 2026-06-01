import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { logout, useCurrentUser, useInvalidateMe } from "../lib/auth.js";
import { ChangePasswordDialog } from "./ChangePasswordDialog.js";

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function UserMenu({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const { data: me } = useCurrentUser();
  const invalidateMe = useInvalidateMe();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!me) return null;

  async function onLogout() {
    await logout();
    await invalidateMe();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-hover"
      >
        <span aria-hidden>{me.avatar || "👤"}</span>
        <span className="hidden max-w-[120px] truncate sm:inline">{me.display_name}</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-border bg-surface shadow-modal">
          <div className="border-b border-border px-3 py-2">
            <div className="text-sm font-medium text-ink">{me.display_name}</div>
            <div className="text-[11px] text-ink-subtle">@{me.handle}</div>
          </div>
          <Link
            to={`/users?edit=${encodeURIComponent(me.id)}`}
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Profile &amp; API tokens
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setChanging(true);
            }}
            className="block w-full px-3 py-1.5 text-left text-xs text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Change password
          </button>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={onToggleTheme}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
          <a
            href="/api/docs"
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            API docs
            <span aria-hidden className="text-ink-subtle">↗</span>
          </a>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
            className="block w-full px-3 py-1.5 text-left text-xs text-danger-text transition-colors hover:bg-surface-hover"
          >
            Log out
          </button>
        </div>
      )}
      {changing && <ChangePasswordDialog onClose={() => setChanging(false)} />}
    </div>
  );
}
