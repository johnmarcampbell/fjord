import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Grant, Space, User } from "@fjord/shared";
import { api } from "../lib/api.js";
import { handleError } from "../lib/toastError.js";
import { Combobox } from "./Combobox.js";

function AvatarGlyph({ avatar }: { avatar: string }) {
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    return <img src={avatar} alt="" className="h-5 w-5 rounded-full object-cover" />;
  }
  return (
    <span
      className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-subtle text-xs"
      aria-hidden
    >
      {avatar}
    </span>
  );
}

export function SpaceAccessList({
  space,
  users,
  grants,
  canManage,
}: {
  space: Space;
  users: User[];
  grants: Grant[];
  canManage: boolean;
}) {
  const queryClient = useQueryClient();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["space-access", space.id] });
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

  const sortedGrants = [...grants].sort((a, b) =>
    a.granted_at.localeCompare(b.granted_at),
  );
  const rows: User[] = [];
  for (const g of sortedGrants) {
    if (g.user_id === space.created_by) continue;
    const u = users.find((x) => x.id === g.user_id && !x.deleted_at);
    if (u) rows.push(u);
  }

  const grantedIds = new Set(grants.map((g) => g.user_id));
  const candidates = users.filter(
    (u) =>
      !u.deleted_at &&
      u.id !== space.created_by &&
      !grantedIds.has(u.id),
  );

  return (
    <section className="border-b border-border py-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          People in this Space
        </h2>
        <span className="text-xs text-ink-subtle">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="mb-3 text-xs italic text-ink-subtle">
          No one else is in this Space yet.
        </p>
      ) : (
        <ul className="mb-3 flex flex-wrap gap-1.5">
          {rows.map((user) => (
            <li
              key={user.id}
              className="group flex items-center gap-1.5 rounded-full border border-border bg-surface-subtle px-2 py-1"
            >
              <AvatarGlyph avatar={user.avatar} />
              <span className="text-xs font-medium text-ink">@{user.handle}</span>
              {canManage && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        `Revoke ${user.display_name}'s access to "${space.name}"?`,
                      )
                    ) {
                      revokeMutation.mutate(user.id);
                    }
                  }}
                  disabled={revokeMutation.isPending}
                  aria-label={`Revoke access for ${user.display_name}`}
                  className="ml-1 text-ink-subtle transition-colors hover:text-danger disabled:opacity-50"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="max-w-md">
          <Combobox
            items={candidates}
            getLabel={(u) => `${u.display_name} (@${u.handle})`}
            onSelect={(u) => grantMutation.mutate(u.id)}
            placeholder="Bring someone into this Space…"
            disabled={grantMutation.isPending}
          />
        </div>
      )}
    </section>
  );
}
