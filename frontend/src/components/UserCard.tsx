import type { User, UserKind } from "@agentic-kanban/shared";

function AvatarGlyph({ avatar }: { avatar: string }) {
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    return <img src={avatar} alt="" className="h-12 w-12 rounded-full object-cover" />;
  }
  return (
    <span
      className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-subtle text-2xl"
      aria-hidden
    >
      {avatar}
    </span>
  );
}

function KindIndicator({ kind }: { kind: UserKind }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
      <span
        className={
          kind === "agent"
            ? "inline-block h-2 w-2 rounded-sm bg-current opacity-60"
            : "inline-block h-2 w-2 rounded-full bg-current opacity-60"
        }
      />
      {kind === "agent" ? "bot" : "human"}
    </span>
  );
}

export function UserCard({
  user,
  isCurrent,
  onEdit,
}: {
  user: User;
  isCurrent: boolean;
  onEdit: () => void;
}) {
  return (
    <div
      className={`relative flex h-44 flex-col rounded-xl border bg-surface p-4 shadow-sm transition-colors ${
        isCurrent ? "border-accent/40 ring-1 ring-accent/20" : "border-border"
      }`}
    >
      {isCurrent && (
        <span className="absolute right-3 top-3 rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
          You
        </span>
      )}
      <div className="flex items-start gap-3">
        <AvatarGlyph avatar={user.avatar} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">{user.display_name}</div>
          <div className="truncate text-xs text-ink-subtle">@{user.handle}</div>
          {user.title && <div className="mt-1 truncate text-xs text-ink-muted">{user.title}</div>}
        </div>
      </div>
      <div className="mt-2 flex-1 overflow-hidden text-xs text-ink-muted">
        {user.bio ? (
          <p className="line-clamp-3 whitespace-pre-wrap">{user.bio}</p>
        ) : (
          <p className="italic text-ink-subtle">No bio</p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <KindIndicator kind={user.kind} />
        {isCurrent && (
          <button
            onClick={onEdit}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:bg-surface-hover"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
