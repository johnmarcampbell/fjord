import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DEFAULT_SPACE_ID, type Space } from "@agentic-kanban/shared";
import { api, ApiError } from "../lib/api.js";
import { useSpaces } from "../lib/queries.js";

export function ManageSpacesDialog({ onClose }: { onClose: () => void }) {
  const { data: spaces = [] } = useSpaces({ includeArchived: true });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-modal border border-border bg-surface p-5 shadow-modal">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Manage spaces</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Close
          </button>
        </div>

        <ul className="divide-y divide-border">
          {spaces.map((s) => (
            <SpaceRow key={s.id} space={s} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function SpaceRow({ space }: { space: Space }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(space.name);
  const isDefault = space.id === DEFAULT_SPACE_ID;
  const isArchived = space.archived_at !== null;

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["spaces"] });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
  }

  function handleError(err: unknown, fallback: string) {
    const msg = err instanceof ApiError ? err.message : fallback;
    toast.error(msg);
  }

  const renameMutation = useMutation({
    mutationFn: () => api.updateSpace(space.id, { name: name.trim() }),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
    onError: (err) => handleError(err, "Rename failed"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => api.archiveSpace(space.id),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Archive failed"),
  });

  const unarchiveMutation = useMutation({
    mutationFn: () => api.unarchiveSpace(space.id),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Unarchive failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSpace(space.id),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Delete failed"),
  });

  return (
    <li className="flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && name.trim() !== space.name) renameMutation.mutate();
              else setEditing(false);
            }}
            className="flex items-center gap-1.5"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-subtle px-2 py-1 text-sm text-ink focus:border-border-focus focus:outline-none transition-colors"
              autoFocus
            />
            <button
              type="submit"
              disabled={!name.trim() || renameMutation.isPending}
              className="rounded-lg bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setName(space.name);
                setEditing(false);
              }}
              className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
            >
              cancel
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${isArchived ? "text-ink-muted" : "text-ink"}`}>
              {space.name}
            </span>
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
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-ink-subtle transition-colors hover:text-ink"
          >
            rename
          </button>
          {isArchived ? (
            <button
              type="button"
              onClick={() => unarchiveMutation.mutate()}
              disabled={unarchiveMutation.isPending}
              className="text-xs font-medium text-ink-subtle transition-colors hover:text-ink"
            >
              unarchive
            </button>
          ) : (
            <button
              type="button"
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              className="text-xs font-medium text-ink-subtle transition-colors hover:text-ink"
            >
              archive
            </button>
          )}
          {!isDefault && (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    `Delete "${space.name}"? Empty projects in it will be removed. The default space and any space with tasks cannot be deleted.`,
                  )
                ) {
                  deleteMutation.mutate();
                }
              }}
              disabled={deleteMutation.isPending}
              className="text-xs font-medium text-ink-subtle transition-colors hover:text-danger"
            >
              delete
            </button>
          )}
        </div>
      )}
    </li>
  );
}
