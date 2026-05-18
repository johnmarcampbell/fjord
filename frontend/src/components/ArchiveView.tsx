import { useMemo, useState } from "react";
import clsx from "clsx";
import { toast } from "sonner";
import type { Project, Task } from "@agentic-kanban/shared";
import { useArchivedTasks, useProjects } from "../lib/queries.js";
import { useUnarchiveTask } from "../lib/mutations.js";
import { FilterBar } from "./FilterBar.js";

interface RowProps {
  task: Task;
  project: Project | undefined;
  onOpen: () => void;
  onUnarchive: (id: string) => void;
}

function ArchiveRow({ task, project, onOpen, onUnarchive }: RowProps) {
  return (
    <div
      onClick={onOpen}
      className={clsx(
        "flex cursor-pointer items-center gap-3 rounded-card bg-surface px-3 py-2 shadow-card",
        "transition-all duration-150 hover:shadow-card-hover",
      )}
    >
      {project && (
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: project.color }}
          />
          <span className="text-[11px] font-medium text-ink-muted">{project.name}</span>
        </div>
      )}

      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
        {task.title}
      </span>

      <span className="hidden flex-shrink-0 truncate text-xs text-ink-muted sm:inline">
        {task.assigned_to ? `@${task.assigned_to}` : "unassigned"}
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

      <div
        className="flex flex-shrink-0 items-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={() => onUnarchive(task.id)}
          className="rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:border-border-focus hover:bg-surface-hover hover:text-ink"
        >
          ← Unarchive
        </button>
      </div>
    </div>
  );
}

export function ArchiveView({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { data: tasks, isLoading } = useArchivedTasks();
  const { data: projects = [] } = useProjects();
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const unarchiveMutation = useUnarchiveTask({
    onSuccess: () => toast.success("Task unarchived"),
    onError: () => toast.error("Failed to unarchive task"),
  });

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const t of tasks ?? []) {
      for (const tag of t.tags) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, [tasks]);

  const sortedTasks = useMemo(() => {
    let result = (tasks ?? []).slice();
    if (selectedProject) {
      result = result.filter((t) => t.project_id === selectedProject);
    }
    if (selectedTags.length > 0) {
      result = result.filter((t) => selectedTags.some((tag) => t.tags.includes(tag)));
    }
    return result.sort((a, b) => {
      const aTime = a.archived_at ? new Date(a.archived_at).getTime() : 0;
      const bTime = b.archived_at ? new Date(b.archived_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [tasks, selectedProject, selectedTags]);

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
      <FilterBar
        selectedProject={selectedProject}
        selectedTags={selectedTags}
        onProjectChange={setSelectedProject}
        onTagsChange={setSelectedTags}
        allTags={allTags}
      />
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
                  onOpen={() => onOpenTask(task.id)}
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
