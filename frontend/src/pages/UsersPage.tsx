import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useUsers } from "../lib/queries.js";
import { useCurrentUser } from "../lib/auth.js";
import { UserCard } from "../components/UserCard.js";
import { UserFormDialog } from "../components/UserFormDialog.js";
import { isAdmin } from "../lib/policy.js";

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; userId: string }
  | null;

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-xl border border-border bg-surface-subtle"
        />
      ))}
    </div>
  );
}

function NewUserTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-44 items-center justify-center rounded-xl border border-dashed border-border bg-transparent text-sm font-semibold text-ink-muted transition-colors hover:border-border-focus hover:bg-surface-hover hover:text-ink"
    >
      + New user
    </button>
  );
}

export function UsersPage() {
  const { data: allUsers = [], isLoading } = useUsers();
  const users = allUsers.filter((u) => !u.deleted_at);
  const [dialog, setDialog] = useState<DialogState>(null);
  const { data: me } = useCurrentUser();
  const currentUserId = me?.id ?? null;
  const currentUser = currentUserId ? allUsers.find((u) => u.id === currentUserId) : undefined;
  const admin = currentUser ? isAdmin(currentUser) : false;
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-link: /users?edit=<userId> auto-opens that user's edit dialog
  // (used by the UserMenu "Profile & API tokens" entry, among others).
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    const target = allUsers.find((u) => u.id === editId && !u.deleted_at);
    if (!target) return;
    const canEdit = admin || target.id === currentUserId;
    if (!canEdit) return;
    setDialog({ mode: "edit", userId: editId });
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
  }, [searchParams, allUsers, admin, currentUserId, setSearchParams]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Users</h1>
        <p className="text-xs text-ink-subtle">
          {users.length} {users.length === 1 ? "user" : "users"}
        </p>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              isCurrent={u.id === currentUserId}
              canEdit={admin || u.id === currentUserId}
              onEdit={() => setDialog({ mode: "edit", userId: u.id })}
            />
          ))}
          {admin && <NewUserTile onClick={() => setDialog({ mode: "create" })} />}
        </div>
      )}

      {dialog && (
        <UserFormDialog
          mode={dialog.mode}
          userId={dialog.mode === "edit" ? dialog.userId : undefined}
          onClose={() => setDialog(null)}
        />
      )}
    </main>
  );
}
