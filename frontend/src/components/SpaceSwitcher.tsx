import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useActiveSpace } from "../lib/SpaceContext.js";

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function SpaceSwitcher() {
  const navigate = useNavigate();
  const { activeSpaceId, activeSpace, spaces, setActiveSpaceId } = useActiveSpace();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selectable = spaces.filter((s) => s.archived_at === null);

  function choose(id: string) {
    setOpen(false);
    if (id !== activeSpaceId) {
      setActiveSpaceId(id);
      navigate("/");
    }
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-ink transition-colors hover:bg-surface-hover"
        title={activeSpace?.name}
      >
        <span className="max-w-[9rem] truncate sm:max-w-[12rem]">{activeSpace?.name ?? "Space"}</span>
        <span className="text-ink-subtle">
          <ChevronIcon />
        </span>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-border bg-surface py-1 shadow-modal">
          <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
            Switch space
          </div>
          <div className="max-h-72 overflow-y-auto">
            {selectable.map((s) => {
              const active = s.id === activeSpaceId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => choose(s.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-surface-hover ${
                    active ? "text-ink" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  <span className="truncate">{s.name}</span>
                  {active && (
                    <span className="shrink-0 text-accent">
                      <CheckIcon />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="my-1 border-t border-border" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/spaces");
            }}
            className="block w-full px-3 py-1.5 text-left text-xs text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Manage spaces…
          </button>
        </div>
      )}
    </div>
  );
}
