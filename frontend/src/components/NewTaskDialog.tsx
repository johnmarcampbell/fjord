import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Column } from "@agentic-kanban/shared";
import { api } from "../lib/api.js";
import { useActiveSpace } from "../lib/SpaceContext.js";

export function NewTaskDialog({
  onClose,
  defaultColumn,
}: {
  onClose: () => void;
  defaultColumn?: Column;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();
  const { activeSpaceId } = useActiveSpace();

  const create = useMutation({
    mutationFn: () =>
      api.createTask({ title, description, column: defaultColumn, space_id: activeSpaceId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) create.mutate();
        }}
        className="w-full max-w-md rounded-modal border border-border bg-surface p-5 shadow-modal"
      >
        <h2 className="mb-4 text-base font-bold text-ink">New task</h2>

        <label className="block text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1">
          Title
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors"
          placeholder="Task title…"
        />

        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-ink-muted mb-1">
          Description
          <span className="ml-1 normal-case font-normal text-ink-subtle">(markdown)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm font-mono text-ink placeholder:text-ink-subtle focus:border-border-focus focus:outline-none transition-colors resize-none"
          placeholder="Optional description…"
        />

        {create.isError && (
          <div className="mt-2 rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger-text">
            {(create.error as Error).message}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || create.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}
