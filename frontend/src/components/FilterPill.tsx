import { useRef } from "react";

interface FilterPillProps {
  label: string;
  count?: number;
  active: boolean;
  onToggle: () => void;
  onSolo: () => void;
}

/**
 * Single-click toggles the pill on/off; double-click solos it (all others off).
 * The click is debounced so the single-click action doesn't fire when a
 * double-click is detected.
 */
export function FilterPill({ label, count, active, onToggle, onSolo }: FilterPillProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onToggle();
    }, 220);
  }

  function handleDoubleClick() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onSolo();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={
        "rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors " +
        (active
          ? "bg-accent text-accent-fg"
          : "border border-border text-ink-subtle hover:bg-surface-hover hover:text-ink-muted")
      }
    >
      {label}
      {count !== undefined && <span className="ml-1 opacity-70">{count}</span>}
    </button>
  );
}
