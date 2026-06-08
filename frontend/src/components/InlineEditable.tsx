import { useState, type ReactNode } from "react";

/**
 * Inline click-to-edit primitives shared by the Space and Project detail
 * headers. Each owns its own `editing`/`draft` state and closes itself when
 * `onSave` resolves; if `onSave` rejects the editor stays open so the caller's
 * mutation `onError` toast is actionable. `onSave` is typically
 * `(v) => mutation.mutateAsync(v)`.
 */

const NAME_MAX = 128;
const DESC_MAX = 2048;

function saveHint() {
  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
  return `${mod}+Enter to save · Esc to cancel`;
}

export function InlineEditableTitle({
  value,
  canEdit,
  isPending,
  onSave,
  leading,
  trailing,
}: {
  value: string;
  canEdit: boolean;
  isPending: boolean;
  onSave: (name: string) => Promise<unknown>;
  /** Rendered before the title in display mode (e.g. a project color dot). */
  leading?: ReactNode;
  /** Rendered after the title in display mode (e.g. badges and actions). */
  trailing?: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function begin() {
    setDraft(value);
    setEditing(true);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  async function save() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setEditing(false);
      return;
    }
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      // Keep editing open; the caller's mutation onError surfaces the toast.
    }
  }

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-1 items-center gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          maxLength={NAME_MAX}
          className="flex-1 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xl font-bold text-ink focus:border-border-focus focus:outline-none transition-colors"
          autoFocus
        />
        <button
          type="submit"
          disabled={!draft.trim() || isPending}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          Save
        </button>
        <button
          type="button"
          onClick={cancel}
          className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
        >
          cancel
        </button>
      </form>
    );
  }

  return (
    <>
      {leading}
      <h1
        onClick={canEdit ? begin : undefined}
        className={`text-xl font-bold tracking-tight text-ink sm:text-2xl ${
          canEdit ? "cursor-pointer rounded px-1 -mx-1 hover:bg-surface-hover" : ""
        }`}
      >
        {value}
      </h1>
      {trailing}
    </>
  );
}

export function InlineEditableDescription({
  value,
  placeholder,
  canEdit,
  isPending,
  onSave,
}: {
  value: string;
  placeholder: string;
  canEdit: boolean;
  isPending: boolean;
  onSave: (description: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  function begin() {
    setDraft(value);
    setEditing(true);
  }

  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  async function save() {
    if (draft === value) {
      setEditing(false);
      return;
    }
    try {
      await onSave(draft);
      setEditing(false);
    } catch {
      // Keep editing open; the caller's mutation onError surfaces the toast.
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              save();
            }
          }}
          rows={3}
          maxLength={DESC_MAX}
          autoFocus
          className="w-full resize-none rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors"
          placeholder={placeholder}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={cancel}
            className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
          >
            cancel
          </button>
          <span className="text-[11px] text-ink-subtle">{saveHint()}</span>
        </div>
      </div>
    );
  }

  if (value) {
    return (
      <p
        onClick={canEdit ? begin : undefined}
        className={`whitespace-pre-wrap text-sm text-ink-muted ${
          canEdit ? "cursor-pointer rounded px-1 -mx-1 hover:bg-surface-hover" : ""
        }`}
      >
        {value}
      </p>
    );
  }

  if (canEdit) {
    return (
      <button
        type="button"
        onClick={begin}
        className="text-sm italic text-ink-subtle transition-colors hover:text-ink-muted"
      >
        Add a description…
      </button>
    );
  }

  return null;
}
