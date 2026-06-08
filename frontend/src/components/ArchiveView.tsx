import { useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { Project, Task, User } from "@fjord/shared";
import { useArchivedTasks, useProjects, useUsers } from "../lib/queries.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { useUnarchiveTask } from "../lib/mutations.js";
import { FilterBar } from "./FilterBar.js";
import { useFilterContext } from "../lib/FilterContext.js";
import { applyTaskFilters, collectTags } from "../lib/taskFilters.js";
import { createUserLookup, formatAssigneeLabel } from "../lib/userLabels.js";

interface RowProps {
  task: Task;
  project: Project | undefined;
  assigneeLabel: string;
  onUnarchive: (id: string) => void;
}

function ArchiveRow({ task, project, assigneeLabel, onUnarchive }: RowProps) {
  return (
    <div className="flex items-center gap-3 rounded-card bg-surface px-3 py-2 shadow-card transition-all duration-150 hover:shadow-card-hover">
      <Link
        to={`/tasks/${task.id}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3"
      >
        {project && (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: project.color }}
            />
            <span className="hidden text-[11px] font-medium text-ink-muted sm:inline">{project.name}</span>
          </div>
        )}

        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          {task.title}
        </span>

        <span className="hidden flex-shrink-0 truncate text-xs text-ink-muted sm:inline">
          {assigneeLabel}
        </span>

        {task.tags.length > 0 && (
          <div className="hidden flex-shrink-0 items-center gap-1 md:flex">
            {task.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-tag-bg px-2 py-0.5 text-[10px] font-semibold text-tag-text"
              >
                {tag}
              </span>
            ))}
            {task.tags.length > 3 && (
              <span className="text-[10px] text-ink-subtle">+{task.tags.length - 3}</span>
            )}
          </div>
        )}

        {task.archived_at && (
          <span className="hidden flex-shrink-0 text-[11px] text-ink-subtle md:inline">
            {new Date(task.archived_at).toLocaleDateString()}
          </span>
        )}
      </Link>

      <button
        onClick={() => onUnarchive(task.id)}
        className="flex-shrink-0 rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:border-border-focus hover:bg-surface-hover hover:text-ink"
      >
        ← Unarchive
      </button>
    </div>
  );
}

export function ArchiveView() {
  const { activeSpaceId } = useActiveSpace();
  const { data: tasks, isLoading } = useArchivedTasks(activeSpaceId);
  const { data: projects = [] } = useProjects(activeSpaceId);
  const { data: users = [] } = useUsers();
  const { selectedProject, selectedTags, selectedUsers } = useFilterContext();
  const unarchiveMutation = useUnarchiveTask({
    onSuccess: () => toast.success("Task unarchived"),
    onError: () => toast.error("Failed to unarchive task"),
  });

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );
  const usersById = useMemo<Map<string, User>>(() => createUserLookup(users), [users]);

  const allTags = useMemo(() => collectTags(tasks ?? []), [tasks]);

  const sortedTasks = useMemo(() => {
    const filtered = applyTaskFilters(tasks ?? [], {
      selectedProject,
      selectedTags,
      selectedUsers,
    });
    return [...filtered].sort((a, b) => {
      const aTime = a.archived_at ? new Date(a.archived_at).getTime() : 0;
      const bTime = b.archived_at ? new Date(b.archived_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [tasks, selectedProject, selectedTags, selectedUsers]);

  const handleUnarchive = (taskId: string) => unarchiveMutation.mutate(taskId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-bg">
        <div className="text-ink-subtle">Loading archived tasks...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <FilterBar allTags={allTags} />
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-4xl">
          {sortedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-2 text-ink-muted">No archived tasks yet</div>
              <div className="text-sm text-ink-subtle">
                Archive completed tasks to keep your board focused
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sortedTasks.map((task) => (
                <ArchiveRow
                  key={task.id}
                  task={task}
                  project={!selectedProject && task.project_id ? projectById.get(task.project_id) : undefined}
                  assigneeLabel={formatAssigneeLabel(usersById, task.assigned_to)}
                  onUnarchive={handleUnarchive}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
