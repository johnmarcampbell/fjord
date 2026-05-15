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
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={clsx(
        "cursor-grab active:cursor-grabbing rounded-card bg-surface px-3 py-2.5 shadow-card",
        "hover:shadow-card-hover hover:-translate-y-px transition-all duration-150",
        isBlocked && "border-l-[3px] border-danger",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-ink text-sm leading-snug truncate">{task.title}</div>
        {project && (
          <span
            className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: project.color }}
            title={project.name}
          />
        )}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-1 text-xs text-ink-muted">
        <span className="truncate">
          {task.assigned_to ? `→ ${task.assigned_to}` : "unassigned"}
        </span>
        {isBlocked && (
          <span className="flex-shrink-0 rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-semibold text-danger-text">
            blocked
          </span>
        )}
      </div>

      {task.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-tag-bg px-2 py-0.5 text-[10px] font-semibold text-tag-text"
            >
              {tag}
            </span>
          ))}
          {task.tags.length > 4 && (
            <span className="text-[10px] text-ink-subtle">+{task.tags.length - 4}</span>
          )}
        </div>
      )}
    </div>
  );
}
