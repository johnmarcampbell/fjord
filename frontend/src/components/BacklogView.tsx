import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { toast } from "sonner";
import { isTaskBlocked, type Column, type Project, type Task } from "@agentic-kanban/shared";
import { useTasks, useProjects } from "../lib/queries.js";
import { useMoveTask } from "../lib/mutations.js";
import { FilterBar } from "./FilterBar.js";

type PromoteHandler = (task: Task, target: Column) => void;

interface RowProps {
  task: Task;
  project: Project | undefined;
  showProject: boolean;
  isBlocked: boolean;
  onOpen: () => void;
  onPromote: PromoteHandler;
}

function RowBody({ task, project, showProject, isBlocked, onPromote }: Omit<RowProps, "onOpen">) {
  return (
    <>
      {showProject && project && (
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

      {isBlocked && (
        <span className="flex-shrink-0 rounded-full bg-danger-bg px-2 py-0.5 text-[10px] font-semibold text-danger-text">
          blocked
        </span>
      )}

      <div className="flex flex-shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onPromote(task, "To Do")}
          className="rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:border-border-focus hover:bg-surface-hover hover:text-ink"
        >
          → To Do
        </button>
        <button
          onClick={() => onPromote(task, "In Progress")}
          className="rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:border-border-focus hover:bg-surface-hover hover:text-ink"
        >
          → In Progress
        </button>
      </div>
    </>
  );
}

function BacklogRow({ task, project, showProject, isBlocked, onOpen, onPromote }: RowProps) {
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
        "flex cursor-grab items-center gap-3 rounded-card bg-surface px-3 py-2 shadow-card",
        "transition-all duration-150 hover:shadow-card-hover active:cursor-grabbing",
        isBlocked && "border-l-[3px] border-danger",
      )}
    >
      <RowBody
        task={task}
        project={project}
        showProject={showProject}
        isBlocked={isBlocked}
        onPromote={onPromote}
      />
    </div>
  );
}

function BacklogRowOverlay({ task, project, showProject, isBlocked, onPromote }: Omit<RowProps, "onOpen">) {
  return (
    <div
      className={clsx(
        "flex cursor-grabbing items-center gap-3 rounded-card bg-surface px-3 py-2 shadow-card shadow-card-hover",
        isBlocked && "border-l-[3px] border-danger",
      )}
    >
      <RowBody
        task={task}
        project={project}
        showProject={showProject}
        isBlocked={isBlocked}
        onPromote={onPromote}
      />
    </div>
  );
}

function BacklogList({
  tasks,
  projectById,
  showProject,
  blockedIds,
  onOpenTask,
  onPromote,
}: {
  tasks: Task[];
  projectById: Map<string, Project>;
  showProject: boolean;
  blockedIds: Set<string>;
  onOpenTask: (id: string) => void;
  onPromote: PromoteHandler;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: "col:Backlog",
    data: { type: "column", column: "Backlog" },
  });

  return (
    <div
      ref={setNodeRef}
      style={
        isOver
          ? { outline: "2px solid var(--color-border-focus)", outlineOffset: "2px" }
          : undefined
      }
      className="min-h-[120px] rounded-xl p-1"
    >
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1.5">
          {tasks.map((task) => (
            <BacklogRow
              key={task.id}
              task={task}
              project={task.project_id ? projectById.get(task.project_id) : undefined}
              showProject={showProject}
              isBlocked={blockedIds.has(task.id)}
              onOpen={() => onOpenTask(task.id)}
              onPromote={onPromote}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export function BacklogView({
  setOpenTaskId,
}: {
  setOpenTaskId: (id: string | null) => void;
}) {
  const { data: tasks = [], isLoading, isError, error } = useTasks();
  const { data: projects = [] } = useProjects();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const moveMutation = useMoveTask();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const t of tasks) {
      if (t.column === "Backlog") {
        for (const tag of t.tags) tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [tasks]);

  const backlogTasks = useMemo(
    () => tasks.filter((t) => t.column === "Backlog").sort((a, b) => a.position - b.position),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    let result = backlogTasks;
    if (selectedProject) {
      result = result.filter((t) => t.project_id === selectedProject);
    }
    if (selectedTags.length > 0) {
      result = result.filter((t) => selectedTags.some((tag) => t.tags.includes(tag)));
    }
    return result;
  }, [backlogTasks, selectedProject, selectedTags]);

  const blockedIds = useMemo(() => {
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const ids = new Set<string>();
    for (const t of tasks) {
      if (isTaskBlocked(t, taskById)) ids.add(t.id);
    }
    return ids;
  }, [tasks]);

  function handlePromote(task: Task, targetColumn: Column) {
    const originalPosition = task.position;
    moveMutation.mutate(
      { id: task.id, version: task.version, column: targetColumn, position: 0 },
      {
        onSuccess: (updatedTask) => {
          toast.success(`Moved to ${targetColumn}`, {
            action: {
              label: "Undo",
              onClick: () => {
                moveMutation.mutate(
                  { id: task.id, version: updatedTask.version, column: "Backlog", position: originalPosition },
                  { onError: () => toast.error("Could not undo — task has changed") },
                );
              },
            },
          });
        },
      },
    );
  }

  function handleDragStart(ev: DragStartEvent) {
    const task = backlogTasks.find((t) => t.id === String(ev.active.id));
    setActiveTask(task ?? null);
  }

  function handleDragCancel() {
    setActiveTask(null);
  }

  function handleDragEnd(ev: DragEndEvent) {
    setActiveTask(null);
    const { active, over } = ev;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const draggedTask = backlogTasks.find((t) => t.id === activeId);
    if (!draggedTask) return;

    let targetIndex: number;
    if (overId === "col:Backlog") {
      targetIndex = backlogTasks.length;
    } else {
      targetIndex = backlogTasks.findIndex((t) => t.id === overId);
      if (targetIndex < 0) targetIndex = backlogTasks.length;
    }

    const reordered = backlogTasks.filter((t) => t.id !== activeId);
    const sourceIndex = backlogTasks.findIndex((t) => t.id === activeId);
    if (sourceIndex === targetIndex) return;

    const before = reordered[targetIndex - 1];
    const after = reordered[targetIndex];
    let newPosition: number;
    if (!before && !after) newPosition = 0;
    else if (!before) newPosition = after!.position - 1;
    else if (!after) newPosition = before.position + 1;
    else newPosition = (before.position + after.position) / 2;

    moveMutation.mutate({
      id: activeId,
      version: draggedTask.version,
      column: "Backlog",
      position: newPosition,
    });
  }

  if (isError) {
    return (
      <div className="p-6 text-sm text-danger">
        Failed to load tasks: {(error as Error).message}
      </div>
    );
  }
  if (isLoading) {
    return <div className="p-6 text-sm text-ink-muted">Loading…</div>;
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
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mx-auto max-w-4xl">
            <BacklogList
              tasks={filteredTasks}
              projectById={projectById}
              showProject={!selectedProject}
              blockedIds={blockedIds}
              onOpenTask={setOpenTaskId}
              onPromote={handlePromote}
            />
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <BacklogRowOverlay
              task={activeTask}
              project={activeTask.project_id ? projectById.get(activeTask.project_id) : undefined}
              showProject={!selectedProject}
              isBlocked={blockedIds.has(activeTask.id)}
              onPromote={handlePromote}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
