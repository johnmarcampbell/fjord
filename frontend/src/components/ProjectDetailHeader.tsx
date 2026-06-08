import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@fjord/shared";
import { api } from "../lib/api.js";
import { handleError } from "../lib/toastError.js";

/**
 * Inline-editable name + description for the project detail page.
 *
 * `canEdit` is always true for anyone who can load the page: `GET` and `PATCH`
 * on `/api/projects/:id` share the same `canAccessSpace` check, so reaching
 * this surface already proves write access. The prop is kept explicit so the
 * affordance is easy to gate differently later if that ever changes.
 *
 * Mirrors the edit UX of `SpaceDetailHeader`: click to edit, explicit
 * Save/cancel, Enter saves the name, Cmd/Ctrl+Enter saves the description,
 * Esc cancels.
 */
export function ProjectDetailHeader({
  project,
  canEdit,
}: {
  project: Project;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [editingName, setEditingName] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);
  const [descDraft, setDescDraft] = useState(project.description);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["project", project.id] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  }

  const nameMutation = useMutation({
    mutationFn: (name: string) => api.updateProject(project.id, { name }),
    onSuccess: () => {
      invalidate();
      setEditingName(false);
    },
    onError: (err) => handleError(err, "Rename failed"),
  });

  const descMutation = useMutation({
    mutationFn: (description: string) => api.updateProject(project.id, { description }),
    onSuccess: () => {
      invalidate();
      setEditingDesc(false);
    },
    onError: (err) => handleError(err, "Update failed"),
  });

  function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameDraft(project.name);
      setEditingName(false);
      return;
    }
    if (trimmed === project.name) {
      setEditingName(false);
      return;
    }
    nameMutation.mutate(trimmed);
  }

  function cancelName() {
    setNameDraft(project.name);
    setEditingName(false);
  }

  function saveDesc() {
    if (descDraft === project.description) {
      setEditingDesc(false);
      return;
    }
    descMutation.mutate(descDraft);
  }

  function cancelDesc() {
    setDescDraft(project.description);
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
          <div className="flex flex-1 items-center gap-2">
            {project.color && (
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-full"
                style={{ background: project.color }}
              />
            )}
            <h1
              onClick={canEdit ? () => setEditingName(true) : undefined}
              className={`text-xl font-bold tracking-tight text-ink sm:text-2xl ${
                canEdit ? "cursor-pointer rounded px-1 -mx-1 hover:bg-surface-hover" : ""
              }`}
            >
              {project.name}
            </h1>
          </div>
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
              placeholder="Describe this project…"
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
        ) : project.description ? (
          <p
            onClick={canEdit ? () => setEditingDesc(true) : undefined}
            className={`whitespace-pre-wrap text-sm text-ink-muted ${
              canEdit ? "cursor-pointer rounded px-1 -mx-1 hover:bg-surface-hover" : ""
            }`}
          >
            {project.description}
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
    </div>
  );
}
