import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError } from "../lib/api.js";
import { useProject, useSpace, useTasks, useUsers } from "../lib/queries.js";
import {
  SortControls,
  TaskRow,
  compareTasks,
  type SortDir,
  type SortField,
} from "../components/taskList.js";
import { ProjectDetailHeader } from "../components/ProjectDetailHeader.js";

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

export function ProjectPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [sortField, setSortField] = useState<SortField>("progress");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const projectQuery = useProject(id || null);
  const project = projectQuery.data;
  const { data: space } = useSpace(project?.space_id);
  const { data: tasks = [] } = useTasks(project ? project.space_id : undefined);
  const { data: users = [] } = useUsers();

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.project_id === id && !t.archived),
    [tasks, id],
  );
  const sortedTasks = useMemo(
    () => [...projectTasks].sort((a, b) => compareTasks(a, b, sortField, sortDir)),
    [projectTasks, sortField, sortDir],
  );

  if (projectQuery.isLoading) return <Skeleton />;

  if (projectQuery.error) {
    const err = projectQuery.error;
    if (err instanceof ApiError) {
      if (err.status === 403) {
        return (
          <EmptyState
            title="You don't have access to this project."
            message="It belongs to a space you can't see. Ask an Admin or the Space Owner for access."
          />
        );
      }
      if (err.status === 404) {
        return (
          <EmptyState
            title="Project not found."
            message="The project may have been deleted or the link is incorrect."
          />
        );
      }
    }
    return (
      <EmptyState
        title="Couldn't load this project."
        message={(err as Error).message ?? "Something went wrong."}
      />
    );
  }

  if (!project) return <Skeleton />;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-4">
        <Link
          to={`/spaces/${project.space_id}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-ink-subtle transition-colors hover:text-ink"
        >
          ← {space ? space.name : "Back"}
        </Link>
      </div>

      <ProjectDetailHeader project={project} canEdit={true} />

      <section className="py-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-ink-muted">Tasks</h2>
          <span className="text-xs text-ink-subtle">({sortedTasks.length})</span>
          <div className="ml-auto">
            <SortControls
              sortField={sortField}
              sortDir={sortDir}
              onChangeField={setSortField}
              onToggleDir={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            />
          </div>
        </div>

        {sortedTasks.length === 0 ? (
          <p className="text-sm italic text-ink-subtle">No tasks in this project yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {sortedTasks.map((t) => (
              <TaskRow key={t.id} task={t} users={users} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
