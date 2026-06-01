import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { toast } from "sonner";
import type { Project, Task } from "@fjord/shared";
import { useIsMobile } from "../lib/useIsMobile.js";
import { useArchiveTask } from "../lib/mutations.js";

function DragGripIcon() {
  return (
    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="3" r="1.25" />
      <circle cx="8" cy="3" r="1.25" />
      <circle cx="2" cy="8" r="1.25" />
      <circle cx="8" cy="8" r="1.25" />
      <circle cx="2" cy="13" r="1.25" />
      <circle cx="8" cy="13" r="1.25" />
    </svg>
  );
}

function ArchiveIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  );
}

interface Props {
  task: Task;
  isBlocked: boolean;
  project: Project | undefined;
  showProject: boolean;
  assigneeLabel: string;
  onOpen: () => void;
}

function CardContent({
  task,
  isBlocked,
  project,
  showProject,
  assigneeLabel,
}: {
  task: Task;
  isBlocked: boolean;
  project: Project | undefined;
  showProject: boolean;
  assigneeLabel: string;
}) {
  const hasActivityBadges = task.comment_count > 0 || task.journal_count > 0;
  return (
    <>
      {showProject && project && (
        <div className="mb-1.5 flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: project.color }}
          />
          <span className="truncate text-[11px] font-medium text-ink-muted">
            {project.name}
          </span>
        </div>
      )}

      <div className="font-semibold text-ink text-sm leading-snug line-clamp-2">
        {task.title}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-1 text-xs text-ink-muted">
        <span className="truncate">{assigneeLabel}</span>
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
        <div className="mt-2 flex items-center gap-2.5 text-[11px] font-semibold text-ink-muted">
          {task.comment_count > 0 && (
            <span className="flex items-center gap-1" title={`${task.comment_count} comment${task.comment_count === 1 ? "" : "s"}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              {task.comment_count}
            </span>
          )}
          {task.journal_count > 0 && (
            <span className="flex items-center gap-1" title={`${task.journal_count} journal entr${task.journal_count === 1 ? "y" : "ies"}`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

export function TaskCard({
  task,
  isBlocked,
  project,
  showProject,
  assigneeLabel,
  onOpen,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", taskId: task.id } });
  const isMobile = useIsMobile();
  const archiveMutation = useArchiveTask(task.id, {
    onError: () => toast.error("Failed to archive task"),
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  const handleProps = isMobile ? { ...attributes, ...listeners } : {};
  const bodyProps = isMobile ? {} : { ...attributes, ...listeners };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group relative flex overflow-hidden rounded-card bg-surface shadow-card",
        "transition-all duration-150 hover:-translate-y-px hover:shadow-card-hover",
        isBlocked && "border-l-[3px] border-danger",
      )}
    >
      <div
        {...handleProps}
        aria-label="Drag to reorder"
        className="flex w-7 flex-shrink-0 touch-none cursor-grab items-center justify-center bg-surface-subtle/60 text-ink-subtle active:cursor-grabbing sm:hidden"
      >
        <DragGripIcon />
      </div>
      <div
        {...bodyProps}
        onClick={onOpen}
        className="flex-1 cursor-pointer px-3 py-2.5 sm:cursor-grab sm:active:cursor-grabbing"
      >
        <CardContent
          task={task}
          isBlocked={isBlocked}
          project={project}
          showProject={showProject}
          assigneeLabel={assigneeLabel}
        />
      </div>
      {task.column === "Done" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            archiveMutation.mutate();
          }}
          title="Archive task"
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-subtle hover:text-ink"
        >
          <ArchiveIcon />
        </button>
      )}
    </div>
  );
}

export function TaskCardOverlay({
  task,
  isBlocked,
  project,
  showProject,
  assigneeLabel,
}: {
  task: Task;
  isBlocked: boolean;
  project: Project | undefined;
  showProject: boolean;
  assigneeLabel: string;
}) {
  return (
    <div
      className={clsx(
        "flex cursor-grabbing overflow-hidden rounded-card bg-surface shadow-card shadow-card-hover",
        isBlocked && "border-l-[3px] border-danger",
      )}
    >
      <div className="flex w-7 flex-shrink-0 items-center justify-center bg-surface-subtle/60 text-ink-subtle sm:hidden">
        <DragGripIcon />
      </div>
      <div className="flex-1 px-3 py-2.5">
        <CardContent
          task={task}
          isBlocked={isBlocked}
          project={project}
          showProject={showProject}
          assigneeLabel={assigneeLabel}
        />
      </div>
    </div>
  );
}
