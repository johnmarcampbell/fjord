import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Task } from "@agentic-kanban/shared";

interface Props {
  task: Task;
  isBlocked: boolean;
  onOpen: () => void;
}

export function TaskCard({ task, isBlocked, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", taskId: task.id } });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={clsx(
        "cursor-grab active:cursor-grabbing rounded-md border bg-slate-800 px-3 py-2 text-sm shadow-sm hover:border-slate-500",
        isBlocked ? "border-red-500/60" : "border-slate-700",
      )}
    >
      <div className="font-medium text-slate-100 truncate">{task.title}</div>
      <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
        <span className="truncate">
          {task.assigned_to ? `→ ${task.assigned_to}` : "unassigned"}
        </span>
        {isBlocked && (
          <span className="rounded bg-red-900/40 text-red-300 px-1.5 py-0.5">
            blocked
          </span>
        )}
      </div>
    </div>
  );
}
