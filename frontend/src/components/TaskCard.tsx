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

function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return `${hex}${a}`;
}

function CardContent({ task, isBlocked }: { task: Task; isBlocked: boolean }) {
  const hasActivityBadges = task.comment_count > 0 || task.journal_count > 0;
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-ink text-sm leading-snug truncate">{task.title}</div>
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

      {hasActivityBadges && (
        <div className="mt-2 flex items-center gap-2 text-[10px] text-ink-subtle">
          {task.comment_count > 0 && (
            <span className="flex items-center gap-0.5" title={`${task.comment_count} comment${task.comment_count === 1 ? "" : "s"}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {task.comment_count}
            </span>
          )}
          {task.journal_count > 0 && (
            <span className="flex items-center gap-0.5" title={`${task.journal_count} journal entr${task.journal_count === 1 ? "y" : "ies"}`}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
              {task.journal_count}
            </span>
          )}
        </div>
      )}
    </>
  );
}

export function TaskCard({ task, isBlocked, project, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", taskId: task.id } });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    backgroundColor: project ? withAlpha(project.color, 0.08) : undefined,
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
      <CardContent task={task} isBlocked={isBlocked} />
    </div>
  );
}

export function TaskCardOverlay({
  task,
  isBlocked,
  project,
}: {
  task: Task;
  isBlocked: boolean;
  project: Project | undefined;
}) {
  return (
    <div
      style={{ backgroundColor: project ? withAlpha(project.color, 0.08) : undefined }}
      className={clsx(
        "cursor-grabbing rounded-card bg-surface px-3 py-2.5 shadow-card shadow-card-hover",
        isBlocked && "border-l-[3px] border-danger",
      )}
    >
      <CardContent task={task} isBlocked={isBlocked} />
    </div>
  );
}
