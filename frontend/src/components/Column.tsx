import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Column as ColumnKey, Task } from "@agentic-kanban/shared";
import { TaskCard } from "./TaskCard.js";

interface Props {
  column: ColumnKey;
  tasks: Task[];
  blockedIds: Set<string>;
  onOpenTask: (id: string) => void;
}

export function ColumnView({ column, tasks, blockedIds, onOpenTask }: Props) {
  const { setNodeRef, isOver } = useDroppable({
    id: `col:${column}`,
    data: { type: "column", column },
  });
  return (
    <div className="flex flex-col gap-2 min-w-[260px] w-[260px]">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          {column}
        </h2>
        <span className="text-xs text-slate-500">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-md border border-slate-800 bg-slate-900/60 p-2 transition-colors min-h-[60px] ${
          isOver ? "border-blue-500/70 bg-slate-900" : ""
        }`}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isBlocked={blockedIds.has(task.id)}
                onOpen={() => onOpenTask(task.id)}
              />
            ))}
          </div>
        </SortableContext>
      </div>
    </div>
  );
}
