import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Column as ColumnKey, Project, Task } from "@agentic-kanban/shared";
import { TaskCard } from "./TaskCard.js";

interface Props {
  column: ColumnKey;
  tasks: Task[];
  blockedIds: Set<string>;
  projectById: Map<string, Project>;
  showProject: boolean;
  onOpenTask: (id: string) => void;
}

export function ColumnView({ column, tasks, blockedIds, projectById, showProject, onOpenTask }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${column}`,
    data: { type: "column", column },
  });

  return (
    <div className="flex w-full flex-shrink-0 flex-col gap-3 sm:w-auto sm:flex-1 sm:flex-shrink sm:min-w-[272px]">
      <div className="flex items-center gap-2 px-1">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-ink-muted">
          {column}
        </h2>
        <span className="text-[11px] font-semibold text-ink-subtle">
          {tasks.length}
        </span>
      </div>

      <div
        ref={setNodeRef}
        style={
          isOver
            ? { outline: "2px solid var(--color-border-focus)", outlineOffset: "2px" }
            : undefined
        }
        className="flex-1 rounded-xl p-1 transition-colors min-h-[80px]"
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
                onOpen={() => onOpenTask(task.id)}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
