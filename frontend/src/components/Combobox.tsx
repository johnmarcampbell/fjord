import { useState, useRef } from "react";

interface ComboboxProps<T> {
  items: T[];
  getLabel: (item: T) => string;
  onSelect: (item: T) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function Combobox<T>({
  items,
  getLabel,
  onSelect,
  placeholder = "Search…",
  disabled = false,
}: ComboboxProps<T>) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = query
    ? items.filter((item) =>
        getLabel(item).toLowerCase().includes(query.toLowerCase())
      )
    : items;

  const visible = filtered.slice(0, 8);

  function select(item: T) {
    onSelect(item);
    setQuery("");
    setOpen(false);
    setHighlightedIndex(0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (visible[highlightedIndex]) select(visible[highlightedIndex]);
    } else if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
      setHighlightedIndex(0);
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlightedIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5 text-xs text-ink-muted placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors disabled:opacity-50"
      />
      {open && visible.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-border bg-surface-elevated py-1 shadow-modal">
          {visible.map((item, i) => (
            <button
              key={i}
              onMouseDown={() => select(item)}
              className={`block w-full px-3 py-1.5 text-left text-xs font-medium transition-colors ${
                i === highlightedIndex
                  ? "bg-surface-hover text-ink"
                  : "text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
            >
              {getLabel(item)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
