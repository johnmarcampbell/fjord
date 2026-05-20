import type { Grant, Space, User } from "@agentic-kanban/shared";

function AvatarGlyph({ avatar }: { avatar: string }) {
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    return <img src={avatar} alt="" className="h-7 w-7 rounded-full object-cover" />;
  }
  return (
    <span
      className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-subtle text-base"
      aria-hidden
    >
      {avatar}
    </span>
  );
}

interface Row {
  user: User;
  isOwner: boolean;
}

export function SpaceAccessList({
  space,
  users,
  grants,
}: {
  space: Space;
  users: User[];
  grants: Grant[];
}) {
  const owner = users.find((u) => u.id === space.created_by && !u.deleted_at);
  const sortedGrants = [...grants].sort((a, b) =>
    a.granted_at.localeCompare(b.granted_at),
  );
  const rows: Row[] = [];
  if (owner) rows.push({ user: owner, isOwner: true });
  for (const g of sortedGrants) {
    const u = users.find((x) => x.id === g.user_id && !x.deleted_at);
    if (u) rows.push({ user: u, isOwner: false });
  }

  return (
    <section className="border-b border-border py-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">
          People with access
        </h2>
        <span className="text-xs text-ink-subtle">{rows.length}</span>
      </div>
      <ul className="flex flex-wrap gap-3">
        {rows.map(({ user, isOwner }) => (
          <li
            key={user.id}
            className="flex items-center gap-2 rounded-full border border-border bg-surface-subtle px-3 py-1.5"
          >
            <AvatarGlyph avatar={user.avatar} />
            <span className="text-xs font-medium text-ink">@{user.handle}</span>
            {isOwner && (
              <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                Owner
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
