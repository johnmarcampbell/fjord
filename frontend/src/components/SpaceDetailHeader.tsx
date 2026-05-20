import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DEFAULT_SPACE_ID, type Space, type User } from "@agentic-kanban/shared";
import { api, ApiError } from "../lib/api.js";

function AvatarGlyph({ avatar }: { avatar: string }) {
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    return <img src={avatar} alt="" className="h-8 w-8 rounded-full object-cover" />;
  }
  return (
    <span
      className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-subtle text-lg"
      aria-hidden
    >
      {avatar}
    </span>
  );
}

export function SpaceDetailHeader({
  space,
  owner,
  canEdit,
}: {
  space: Space;
  owner: User | undefined;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameDraft, setNameDraft] = useState(space.name);
  const [descDraft, setDescDraft] = useState(space.description);
  const isArchived = space.archived_at !== null;
  const isDefault = space.id === DEFAULT_SPACE_ID;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["space", space.id] });
    queryClient.invalidateQueries({ queryKey: ["spaces"] });
  }

  function handleError(err: unknown, fallback: string) {
    const msg = err instanceof ApiError ? err.message : fallback;
    toast.error(msg);
  }

  const nameMutation = useMutation({
    mutationFn: (name: string) => api.updateSpace(space.id, { name }),
    onSuccess: () => {
      invalidate();
      setEditingName(false);
    },
    onError: (err) => handleError(err, "Rename failed"),
  });

  const descMutation = useMutation({
    mutationFn: (description: string) => api.updateSpace(space.id, { description }),
    onSuccess: () => {
      invalidate();
      setEditingDesc(false);
    },
    onError: (err) => handleError(err, "Update failed"),
  });

  function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(space.name);
      setEditingName(false);
      return;
    }
    if (trimmed === space.name) {
      setEditingName(false);
      return;
    }
    nameMutation.mutate(trimmed);
  }

  function cancelName() {
    setNameDraft(space.name);
    setEditingName(false);
  }

  function saveDesc() {
    if (descDraft === space.description) {
      setEditingDesc(false);
      return;
    }
    descMutation.mutate(descDraft);
  }

  function cancelDesc() {
    setDescDraft(space.description);
    setEditingDesc(false);
  }

  return (
    <div className="border-b border-border pb-5">
      <div className="flex flex-wrap items-center gap-2">
        {editingName ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveName();
            }}
            className="flex flex-1 items-center gap-2"
          >
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelName();
                }
              }}
              maxLength={128}
              className="flex-1 rounded-lg border border-border bg-surface-subtle px-3 py-2 text-xl font-bold text-ink focus:border-border-focus focus:outline-none transition-colors"
              autoFocus
            />
            <button
              type="submit"
              disabled={!nameDraft.trim() || nameMutation.isPending}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={cancelName}
              className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
            >
              cancel
            </button>
          </form>
        ) : (
          <>
            <h1
              onClick={canEdit ? () => setEditingName(true) : undefined}
              className={`text-xl font-bold tracking-tight text-ink sm:text-2xl ${
                canEdit ? "cursor-pointer rounded px-1 -mx-1 hover:bg-surface-hover" : ""
              }`}
            >
              {space.name}
            </h1>
            {isDefault && (
              <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                system
              </span>
            )}
            {isArchived && (
              <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                archived
              </span>
            )}
          </>
        )}
      </div>

      <div className="mt-3">
        {editingDesc ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  cancelDesc();
                } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  saveDesc();
                }
              }}
              rows={3}
              maxLength={2048}
              autoFocus
              className="w-full resize-none rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors"
              placeholder="Describe this space…"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveDesc}
                disabled={descMutation.isPending}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                Save
              </button>
              <button
                type="button"
                onClick={cancelDesc}
                className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
              >
                cancel
              </button>
              <span className="text-[11px] text-ink-subtle">
                {navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl"}+Enter to save · Esc to cancel
              </span>
            </div>
          </div>
        ) : space.description ? (
          <p
            onClick={canEdit ? () => setEditingDesc(true) : undefined}
            className={`whitespace-pre-wrap text-sm text-ink-muted ${
              canEdit ? "cursor-pointer rounded px-1 -mx-1 hover:bg-surface-hover" : ""
            }`}
          >
            {space.description}
          </p>
        ) : canEdit ? (
          <button
            type="button"
            onClick={() => setEditingDesc(true)}
            className="text-sm italic text-ink-subtle transition-colors hover:text-ink-muted"
          >
            Add a description…
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
          Owner
        </span>
        {owner ? (
          <div className="flex items-center gap-2">
            <AvatarGlyph avatar={owner.avatar} />
            <span className="text-sm text-ink">@{owner.handle}</span>
          </div>
        ) : (
          <span className="text-sm italic text-ink-subtle">unknown</span>
        )}
      </div>
    </div>
  );
}
