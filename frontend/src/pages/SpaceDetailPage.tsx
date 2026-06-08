import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api.js";
import { useProjects, useSpaceAccess, useTasks, useUsers } from "../lib/queries.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { useCurrentUser } from "../lib/auth.js";
import { canManageSpace } from "../lib/policy.js";
import { SpaceDetailHeader } from "../components/SpaceDetailHeader.js";
import { SpaceAccessList } from "../components/SpaceAccessList.js";
import { SpaceProjectTree } from "../components/SpaceProjectTree.js";

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mt-2 text-xs text-ink-subtle">{message}</p>
      </div>
    </main>
  );
}

function Skeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-surface-subtle" />
      <div className="mt-4 h-4 w-96 animate-pulse rounded bg-surface-subtle" />
      <div className="mt-8 h-32 animate-pulse rounded-xl bg-surface-subtle" />
    </main>
  );
}

export function SpaceDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { activeSpaceId, setActiveSpaceId } = useActiveSpace();

  useEffect(() => {
    if (id && id !== activeSpaceId) setActiveSpaceId(id);
  }, [id, activeSpaceId, setActiveSpaceId]);

  const spaceQuery = useQuery({
    queryKey: ["space", id],
    queryFn: () => api.getSpace(id),
    enabled: !!id,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && (err.status === 403 || err.status === 404)) return false;
      return failureCount < 2;
    },
  });
  const { data: users = [] } = useUsers();
  const { data: grants = [] } = useSpaceAccess(spaceQuery.data ? id : null);
  const { data: projects = [] } = useProjects(spaceQuery.data ? id : undefined);
  const { data: tasks = [] } = useTasks(spaceQuery.data ? id : undefined);
  const { data: me } = useCurrentUser();

  if (spaceQuery.isLoading) return <Skeleton />;

  if (spaceQuery.error) {
    const err = spaceQuery.error;
    if (err instanceof ApiError) {
      if (err.status === 403) {
        return (
          <EmptyState
            title="You don't have access to this space."
            message="Ask an Admin or the Space Owner for access."
          />
        );
      }
      if (err.status === 404) {
        return (
          <EmptyState
            title="Space not found."
            message="The space may have been deleted or the link is incorrect."
          />
        );
      }
    }
    return (
      <EmptyState
        title="Couldn't load this space."
        message={(err as Error).message ?? "Something went wrong."}
      />
    );
  }

  const space = spaceQuery.data;
  if (!space) return <Skeleton />;

  const currentUser = me ? users.find((u) => u.id === me.id) : undefined;
  const canEdit = currentUser ? canManageSpace(currentUser, space) : false;
  const owner = users.find((u) => u.id === space.created_by);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <SpaceDetailHeader space={space} owner={owner} canEdit={canEdit} currentUser={me ?? undefined} />
      <SpaceAccessList space={space} users={users} grants={grants} canManage={canEdit} />
      <SpaceProjectTree
        projects={projects}
        tasks={tasks}
        users={users}
      />
    </main>
  );
}
