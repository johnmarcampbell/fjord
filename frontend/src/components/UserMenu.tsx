import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { logout, useCurrentUser, useInvalidateMe } from "../lib/auth.js";
import { ChangePasswordDialog } from "./ChangePasswordDialog.js";

export function UserMenu() {
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
            to={`/users`}
            onClick={() => setOpen(false)}
            className="block px-3 py-1.5 text-xs text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Profile & API tokens
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
