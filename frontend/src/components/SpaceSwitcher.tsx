import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { ManageSpacesDialog } from "./ManageSpacesDialog.js";

export function SpaceSwitcher() {
  const { activeSpaceId, spaces, setActiveSpaceId } = useActiveSpace();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);
  const [newName, setNewName] = useState("");

  const createMutation = useMutation({
    mutationFn: () => api.createSpace({ name: newName.trim() }),
    onSuccess: (s) => {
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      setActiveSpaceId(s.id);
      setNewName("");
      setCreating(false);
    },
  });

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-xs text-ink-subtle sm:inline">Space</span>
      <select
        value={activeSpaceId}
        onChange={(e) => setActiveSpaceId(e.target.value)}
        className="max-w-[140px] rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-xs font-medium text-ink focus:border-border-focus focus:outline-none transition-colors"
      >
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) createMutation.mutate();
          }}
          className="flex items-center gap-1.5"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Space name"
            className="w-32 rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-xs text-ink focus:border-border-focus focus:outline-none transition-colors"
            autoFocus
          />
          <button
            type="submit"
            disabled={!newName.trim() || createMutation.isPending}
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false);
              setNewName("");
            }}
            className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
          >
            cancel
          </button>
        </form>
      ) : (
        <>
          <button
            onClick={() => setCreating(true)}
            className="hidden whitespace-nowrap text-xs font-medium text-ink-subtle transition-colors hover:text-ink-muted sm:inline"
          >
            + New space
          </button>
          <button
            onClick={() => setManaging(true)}
            className="hidden whitespace-nowrap text-xs font-medium text-ink-subtle transition-colors hover:text-ink-muted sm:inline"
          >
            Manage
          </button>
        </>
      )}
      {managing && <ManageSpacesDialog onClose={() => setManaging(false)} />}
    </div>
  );
}
