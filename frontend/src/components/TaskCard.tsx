import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import type { Project, Task } from "@agentic-kanban/shared";

interface Props {
  task: Task;
  isBlocked: boolean;
  project: Project | undefined;
  onOpen: () => void;
}

export function TaskCard({ task, isBlocked, project, onOpen }: Props) {
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
      <div className="flex items-start justify-between gap-1.5">
        <div className="font-medium text-slate-100 truncate">{task.title}</div>
        {project && (
          <span
            className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: project.color }}
            title={project.name}
          />
        )}
      </div>
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
      {task.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-sm bg-slate-700 px-1 py-0.5 text-[10px] text-slate-300"
            >
              {tag}
            </span>
          ))}
          {task.tags.length > 4 && (
            <span className="text-[10px] text-slate-500">+{task.tags.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}
