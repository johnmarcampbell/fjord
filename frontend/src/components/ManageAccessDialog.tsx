import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Space, User } from "@agentic-kanban/shared";
import { api, ApiError } from "../lib/api.js";
import { useSpaceAccess, useUsers } from "../lib/queries.js";
import { Combobox } from "./Combobox.js";

function ownerOf(space: Space, users: User[]): User | undefined {
  return users.find((u) => u.id === space.created_by);
}

export function ManageAccessDialog({
  space,
  onClose,
}: {
  space: Space;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: grants = [], isLoading } = useSpaceAccess(space.id);
  const { data: users = [] } = useUsers();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["space-access", space.id] });
  }

  function handleError(err: unknown, fallback: string) {
    const msg = err instanceof ApiError ? err.message : fallback;
    toast.error(msg);
  }

  const grantMutation = useMutation({
    mutationFn: (userId: string) => api.grantSpaceAccess(space.id, { user_id: userId }),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Grant failed"),
  });

  const revokeMutation = useMutation({
    mutationFn: (userId: string) => api.revokeSpaceAccess(space.id, userId),
    onSuccess: () => invalidate(),
    onError: (err) => handleError(err, "Revoke failed"),
  });

  const owner = ownerOf(space, users);
  const grantedIds = new Set(grants.map((g) => g.user_id));
  const candidates = users.filter(
    (u) =>
      !u.deleted_at &&
      u.role !== "Admin" &&
      u.id !== space.created_by &&
      !grantedIds.has(u.id),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-modal border border-border bg-surface p-5 shadow-modal">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Manage access</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            Close
          </button>
        </div>
        <p className="mb-4 text-xs text-ink-subtle">
          Space: <span className="font-medium text-ink-muted">{space.name}</span>
          {owner && (
            <>
              {" · Owner: "}
              <span className="font-medium text-ink-muted">{owner.display_name}</span>
            </>
          )}
        </p>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-ink-muted">
            Grant access to a Member
          </label>
          <Combobox
            items={candidates}
            getLabel={(u) => `${u.display_name} (${u.handle})`}
            onSelect={(u) => grantMutation.mutate(u.id)}
            placeholder="Search Members…"
            disabled={grantMutation.isPending}
          />
          <p className="mt-1 text-[11px] text-ink-subtle">
            Admins already have access to all spaces and are excluded from this list.
          </p>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle">
            Current grants
          </h3>
          {isLoading ? (
            <p className="text-xs text-ink-subtle">Loading…</p>
          ) : grants.length === 0 ? (
            <p className="text-xs text-ink-subtle">
              No explicit grants yet. Only the owner and Admins can access this space.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {grants.map((g) => {
                const u = users.find((x) => x.id === g.user_id);
                return (
                  <li key={g.user_id} className="flex items-center gap-3 py-2">
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="font-medium text-ink">
                        {u?.display_name ?? g.user_id}
                      </span>
                      {u?.handle && (
                        <span className="ml-1 text-xs text-ink-subtle">@{u.handle}</span>
                      )}
                      <span className="ml-2 text-[11px] text-ink-subtle">
                        granted {new Date(g.granted_at).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `Revoke ${u?.display_name ?? g.user_id}'s access to "${space.name}"?`,
                          )
                        ) {
                          revokeMutation.mutate(g.user_id);
                        }
                      }}
                      disabled={revokeMutation.isPending}
                      className="text-xs font-medium text-ink-subtle transition-colors hover:text-danger disabled:opacity-50"
                    >
                      revoke
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
