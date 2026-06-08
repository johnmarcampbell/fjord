import { useState } from "react";

/**
 * Generic presentational form primitives shared by the task detail surface and
 * the new-task page. Not task-specific — just labelled field chrome and a
 * tag-entry control.
 */

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3
      className={`text-[11px] font-bold uppercase tracking-widest text-ink-muted ${className ?? ""}`}
    >
      {children}
    </h3>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-widest text-ink-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

export function TagInput({
  value,
  allTags,
  onChange,
}: {
  value: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = allTags.filter(
    (t) => t.toLowerCase().includes(input.toLowerCase()) && !value.includes(t),
  );

  function addTag(tag: string) {
    const clean = tag.trim().toLowerCase();
    if (clean && !value.includes(clean)) {
      onChange([...value, clean]);
    }
    setInput("");
    setShowSuggestions(false);
  }

  function removeTag(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  return (
    <div className="relative">
      <div className="flex min-h-[36px] flex-wrap items-center gap-1.5 rounded-lg border border-border bg-surface-subtle px-2.5 py-1.5">
        {value.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-tag-bg px-2.5 py-0.5 text-[11px] font-semibold text-tag-text"
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="opacity-60 transition-opacity hover:opacity-100"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === ",") && input.trim()) {
              e.preventDefault();
              addTag(input);
            }
            if (e.key === "Backspace" && !input && value.length) {
              removeTag(value[value.length - 1]);
            }
          }}
          placeholder={value.length === 0 ? "Add tags…" : ""}
          className="min-w-[80px] flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-ink-subtle"
        />
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-xl border border-border bg-surface-elevated py-1 shadow-modal">
          {suggestions.slice(0, 6).map((tag) => (
            <button
              key={tag}
              onMouseDown={() => addTag(tag)}
              className="block w-full px-3 py-1.5 text-left text-xs font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
