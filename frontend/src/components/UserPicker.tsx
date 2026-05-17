import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { getCurrentUserId, setCurrentUserId } from "../lib/user.js";
import { useUsers } from "../lib/queries.js";

export function UserPicker() {
  const { data: users = [], isLoading } = useUsers();
  const [current, setCurrent] = useState<string | null>(getCurrentUserId());
  const [creating, setCreating] = useState(false);
  const [newId, setNewId] = useState("");
  const [newKind, setNewKind] = useState<"human" | "agent">("human");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (users.length === 0) return;
    const valid = users.some((u) => u.id === current);
    if (!valid) {
      const first = users[0]!.id;
      setCurrentUserId(first);
      setCurrent(first);
    }
  }, [users, current]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createUser({ id: newId, display_name: newId, kind: newKind }),
    onSuccess: (u) => {
      setCurrentUserId(u.id);
      setCurrent(u.id);
      setNewId("");
      setCreating(false);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  if (isLoading) {
    return <div className="text-xs text-ink-subtle">Loading…</div>;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-subtle">Acting as</span>
      <select
        value={current ?? ""}
        onChange={(e) => {
          setCurrentUserId(e.target.value || null);
          setCurrent(e.target.value || null);
        }}
        className="rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-xs font-medium text-ink focus:border-border-focus focus:outline-none transition-colors"
      >
        <option value="" disabled>
          (none)
        </option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.display_name}
            {u.kind === "agent" ? " (agent)" : ""}
          </option>
        ))}
      </select>

      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newId.trim()) createMutation.mutate();
          }}
          className="flex items-center gap-1.5"
        >
          <input
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
            placeholder="id"
            className="w-24 rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-xs text-ink focus:border-border-focus focus:outline-none transition-colors"
            autoFocus
          />
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as "human" | "agent")}
            className="rounded-lg border border-border bg-surface-subtle px-2 py-1.5 text-xs text-ink focus:border-border-focus focus:outline-none transition-colors"
          >
            <option value="human">human</option>
            <option value="agent">agent</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="text-xs text-ink-subtle transition-colors hover:text-ink-muted"
          >
            cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="text-xs font-medium text-ink-subtle transition-colors hover:text-ink-muted"
        >
          + Add identity
        </button>
      )}
    </div>
  );
}
