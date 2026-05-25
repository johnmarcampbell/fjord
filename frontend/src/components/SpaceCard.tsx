import { Link } from "react-router-dom";
import { DEFAULT_SPACE_ID, type Space } from "@agentic-kanban/shared";

export function SpaceCard({
  space,
  ownerHandle,
  withAccessCount,
  projectCount,
}: {
  space: Space;
  ownerHandle: string;
  withAccessCount: number;
  projectCount: number;
}) {
  const isDefault = space.id === DEFAULT_SPACE_ID;
  const isArchived = space.archived_at !== null;
  return (
    <Link
      to={`/spaces/${space.id}`}
      className="group relative flex h-44 flex-col rounded-xl border border-border bg-surface p-4 shadow-sm transition-colors hover:border-border-focus hover:bg-surface-hover"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-bold text-ink">{space.name}</div>
            {isDefault && (
              <span className="shrink-0 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                system
              </span>
            )}
            {isArchived && (
              <span className="shrink-0 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                archived
              </span>
            )}
            {!space.affiliated && (
              <span className="shrink-0 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-subtle">
                not joined
              </span>
            )}
          </div>
          <div className="truncate text-xs text-ink-subtle">@{ownerHandle}</div>
        </div>
      </div>

      <div className="mt-2 flex-1 overflow-hidden text-xs text-ink-muted">
        {space.description ? (
          <p className="line-clamp-3 whitespace-pre-wrap">{space.description}</p>
        ) : (
          <p className="italic text-ink-subtle">No description</p>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
        <span>
          {withAccessCount} with access
        </span>
        <span>
          {projectCount} {projectCount === 1 ? "project" : "projects"}
        </span>
      </div>
    </Link>
  );
}
