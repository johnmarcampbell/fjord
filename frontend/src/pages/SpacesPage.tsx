import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import { useSpaces, useUsers, useProjects } from "../lib/queries.js";
import { SpaceCard } from "../components/SpaceCard.js";
import { NewSpaceDialog } from "../components/NewSpaceDialog.js";

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

function NewSpaceTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex h-44 items-center justify-center rounded-xl border border-dashed border-border bg-transparent text-sm font-semibold text-ink-muted transition-colors hover:border-border-focus hover:bg-surface-hover hover:text-ink"
    >
      + New space
    </button>
  );
}

export function SpacesPage() {
  const { data: spaces = [], isLoading } = useSpaces();
  const { data: users = [] } = useUsers();
  const { data: projects = [] } = useProjects();
  const [creating, setCreating] = useState(false);

  const accessQueries = useQueries({
    queries: spaces.map((s) => ({
      queryKey: ["space-access", s.id],
      queryFn: () => api.listSpaceAccess(s.id),
    })),
  });

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-baseline justify-between">
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">Spaces</h1>
        <p className="text-xs text-ink-subtle">
          {spaces.length} {spaces.length === 1 ? "space" : "spaces"}
        </p>
      </div>

      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((s, i) => {
            const owner = users.find((u) => u.id === s.created_by);
            const ownerHandle = owner?.handle ?? "unknown";
            const grants = accessQueries[i]?.data ?? [];
            const withAccessCount = 1 + grants.length;
            const projectCount = projects.filter((p) => p.space_id === s.id).length;
            return (
              <SpaceCard
                key={s.id}
                space={s}
                ownerHandle={ownerHandle}
                withAccessCount={withAccessCount}
                projectCount={projectCount}
              />
            );
          })}
          <NewSpaceTile onClick={() => setCreating(true)} />
        </div>
      )}

      {creating && <NewSpaceDialog onClose={() => setCreating(false)} />}
    </main>
  );
}
