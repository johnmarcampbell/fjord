import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Column as ColumnKey, Project, Task, User } from "@agentic-kanban/shared";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "../lib/api.js";
import { TaskCard } from "./TaskCard.js";
import { formatAssigneeLabel } from "../lib/userLabels.js";

interface Props {
  column: ColumnKey;
  tasks: Task[];
  blockedIds: Set<string>;
  projectById: Map<string, Project>;
  usersById: Map<string, User>;
  showProject: boolean;
  onOpenTask: (id: string) => void;
}

export function ColumnView({
  column,
  tasks,
  blockedIds,
  projectById,
  usersById,
  showProject,
  onOpenTask,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${column}`,
    data: { type: "column", column },
  });
  const queryClient = useQueryClient();

  async function handleArchiveAll() {
    if (!window.confirm(`Archive all ${tasks.length} task${tasks.length === 1 ? "" : "s"} in Done?`)) return;
    const results = await Promise.allSettled(tasks.map((t) => api.archiveTask(t.id)));
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
    queryClient.invalidateQueries({ queryKey: ["archived-tasks"] });
    if (failed === 0) {
      toast.success(`Archived ${succeeded} task${succeeded === 1 ? "" : "s"}`);
    } else {
      toast.error(`Archived ${succeeded}, failed ${failed}`);
    }
  }

  return (
    <div className="flex w-full flex-shrink-0 flex-col gap-3 sm:h-full sm:w-auto sm:min-h-0 sm:flex-1 sm:flex-shrink sm:min-w-[272px]">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-muted">
          {column}
        </h2>
        <span className="text-[11px] font-semibold text-ink-subtle">
          {tasks.length}
        </span>
        {column === "Done" && tasks.length > 0 && (
          <button
            onClick={handleArchiveAll}
            className="ml-auto text-[11px] font-semibold text-ink-subtle transition-colors hover:text-ink"
            title="Archive all Done tasks"
          >
            Archive all
          </button>
        )}
      </div>

      <div
        ref={setNodeRef}
        style={
          isOver
            ? { outline: "2px solid var(--color-border-focus)", outlineOffset: "2px" }
            : undefined
        }
        className="flex-1 rounded-xl p-1 transition-colors min-h-[80px] sm:overflow-y-auto sm:min-h-0"
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isBlocked={blockedIds.has(task.id)}
                project={task.project_id ? projectById.get(task.project_id) : undefined}
                showProject={showProject}
                assigneeLabel={formatAssigneeLabel(usersById, task.assigned_to)}
                onOpen={() => onOpenTask(task.id)}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
