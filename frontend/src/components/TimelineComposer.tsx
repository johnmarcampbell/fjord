import { useState } from "react";
import type { UseTaskEditor } from "../lib/useTaskEditor.js";

type ComposerMode = "comment" | "journal";

const PLACEHOLDERS: Record<ComposerMode, string> = {
  comment: "Add a comment — talk to other actors (markdown)",
  journal:
    "Add a journal entry — durable working notes for your future self (markdown)",
};

/**
 * Single timeline composer: one textarea whose destination — a Comment or a
 * Journal entry — is chosen by the segmented toggle. The draft buffer is shared
 * across modes, so text typed in one mode survives flipping to the other; only
 * the destination changes. ⌘/Ctrl+Enter submits the active mode. After a
 * successful post the draft clears but the mode is left where it was.
 */
export function TimelineComposer({ editor }: { editor: UseTaskEditor }) {
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<ComposerMode>("comment");

  const pending =
    mode === "comment" ? editor.commentPending : editor.journalPending;
  const canSubmit = draft.trim() !== "" && !pending;

  function submit() {
    if (!canSubmit) return;
    const post = mode === "comment" ? editor.addComment : editor.addJournal;
    post(draft, { onSuccess: () => setDraft("") });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mt-4"
    >
      <div
        role="group"
        aria-label="Choose what to post"
        className="mb-2 flex justify-end gap-0.5"
      >
        {(["comment", "journal"] as const).map((m) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={active}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                active
                  ? "bg-accent text-accent-fg"
                  : "text-ink-muted hover:bg-surface-hover hover:text-ink"
              }`}
            >
              {m === "comment" ? "Comment" : "Journal"}
            </button>
          );
        })}
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={PLACEHOLDERS[mode]}
        rows={2}
        className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors resize-none"
      />
      <div className="mt-1.5 flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink disabled:opacity-40"
        >
          Post
        </button>
      </div>
    </form>
  );
}
