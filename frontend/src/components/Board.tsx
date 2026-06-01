import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  COLUMNS,
  isTaskBlocked,
  type User,
  type Column,
  type Task,
} from "@fjord/shared";
import { useTasks, useProjects, useUsers } from "../lib/queries.js";
import { useMoveTask } from "../lib/mutations.js";
import { useActiveSpace } from "../lib/SpaceContext.js";
import { ColumnView } from "./Column.js";
import { TaskCardOverlay } from "./TaskCard.js";
import { FilterBar } from "./FilterBar.js";
import { useFilterContext, UNASSIGNED_SENTINEL } from "../lib/FilterContext.js";
import { createUserLookup, formatAssigneeLabel } from "../lib/userLabels.js";

const BOARD_COLUMNS = COLUMNS.filter((c) => c !== "Backlog");

/**
 * Resolve a dnd-kit `over.id` to a { column, index } drop target.
 * Returns null if the id doesn't map to a known column or task.
 * Used by both handleDragOver (visual preview) and handleDragEnd (drop math)
 * so the ghost always predicts the real drop position.
 */
function resolveDropTarget(
  overId: string,
  byColumn: Map<Column, Task[]>,
  tasks: Task[],
): { column: Column; index: number } | null {
  if (overId.startsWith("col:")) {
    const column = overId.slice(4) as Column;
    if (!byColumn.has(column)) return null;
    return { column, index: byColumn.get(column)!.length };
  }
  const overTask = tasks.find((t) => t.id === overId);
  if (!overTask) return null;
  const column = overTask.column as Column;
  const list = byColumn.get(column) ?? [];
  const idx = list.findIndex((t) => t.id === overId);
  return { column, index: idx < 0 ? list.length : idx };
}

export function Board({
  setOpenTaskId,
}: {
  setOpenTaskId: (id: string | null) => void;
}) {
  const { activeSpaceId } = useActiveSpace();
  const { data: tasks = [], isLoading, isError, error } = useTasks(activeSpaceId);
  const { data: projects = [] } = useProjects(activeSpaceId);
  const { data: users = [] } = useUsers();
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  // Tracks an in-progress cross-column drag for the visual ghost preview.
  // taskId is not stored here — activeTask.id is the single source of truth.
  const [crossColumnDrag, setCrossColumnDrag] = useState<{
    targetColumn: Column;
    insertIndex: number;
  } | null>(null);
  const { selectedProject, selectedTags, selectedUsers } = useFilterContext();

  const moveMutation = useMoveTask();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const projectById = useMemo(
    () => new Map(projects.map((p) => [p.id, p])),
    [projects],
  );
  const usersById = useMemo<Map<string, User>>(() => createUserLookup(users), [users]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const t of tasks) {
      for (const tag of t.tags) tagSet.add(tag);
    }
    return Array.from(tagSet).sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (selectedProject) {
      result = result.filter((t) => t.project_id === selectedProject);
    }
    if (selectedTags.length > 0) {
      result = result.filter((t) => selectedTags.some((tag) => t.tags.includes(tag)));
    }
    if (selectedUsers.length > 0) {
      result = result.filter((t) => {
        if (selectedUsers.includes(UNASSIGNED_SENTINEL) && t.assigned_to === null) return true;
        return t.assigned_to !== null && selectedUsers.includes(t.assigned_to);
      });
    }
    return result;
  }, [tasks, selectedProject, selectedTags, selectedUsers]);

  const byColumn = useMemo(() => {
    const map = new Map<Column, Task[]>();
    for (const c of BOARD_COLUMNS) map.set(c, []);
    for (const t of filteredTasks) {
      if (t.column === "Backlog") continue;
      const col = (COLUMNS as readonly string[]).includes(t.column)
        ? (t.column as Column)
        : "To Do";
      if (map.has(col)) map.get(col)!.push(t);
    }
    for (const c of BOARD_COLUMNS) {
      map.get(c)!.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [filteredTasks]);

  const blockedIds = useMemo(() => {
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const ids = new Set<string>();
    for (const t of tasks) {
      if (isTaskBlocked(t, taskById)) ids.add(t.id);
    }
    return ids;
  }, [tasks]);

  function handleDragStart(ev: DragStartEvent) {
    const task = tasks.find((t) => t.id === String(ev.active.id));
    setActiveTask(task ?? null);
    setCrossColumnDrag(null);
  }

  function handleDragCancel() {
    setActiveTask(null);
    setCrossColumnDrag(null);
  }

  function handleDragOver(ev: DragOverEvent) {
    const { active, over } = ev;
    if (!over) return setCrossColumnDrag(null);
    const activeId = String(active.id);
    const overId = String(over.id);
    // When the pointer is directly over the ghost card itself, dnd-kit may
    // briefly report over.id === active.id. Ignore it to avoid a flicker
    // where crossColumnDrag nulls out for one frame and the ghost snaps back.
    if (overId === activeId) return;
    const dragged = tasks.find((t) => t.id === activeId);
    const target = dragged && resolveDropTarget(overId, byColumn, tasks);
    if (!target || dragged.column === target.column) return setCrossColumnDrag(null);
    setCrossColumnDrag({ targetColumn: target.column, insertIndex: target.index });
  }

  function handleDragEnd(ev: DragEndEvent) {
    setActiveTask(null);
    setCrossColumnDrag(null);
    const { active, over } = ev;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    const target = resolveDropTarget(overId, byColumn, tasks);
    if (!target) return;
    const { column: targetColumn, index: targetIndex } = target;

    const sourceList = byColumn.get(activeTask.column as Column) ?? [];
    const targetList = byColumn.get(targetColumn)!.filter((t) => t.id !== activeId);
    if (
      activeTask.column === targetColumn &&
      sourceList.findIndex((t) => t.id === activeId) === targetIndex
    )
      return;

    const before = targetList[targetIndex - 1];
    const after = targetList[targetIndex];
    let newPosition: number;
    if (!before && !after) newPosition = 0;
    else if (!before) newPosition = after!.position - 1;
    else if (!after) newPosition = before.position + 1;
    else newPosition = (before.position + after.position) / 2;

    moveMutation.mutate({
      id: activeId,
      version: activeTask.version,
      column: targetColumn,
      position: newPosition,
    });
  }

  // Visual-only column layout during a cross-column drag: removes the card
  // from its source column and splices it into the target at the hover index
  // so SortableContext renders it as a ghost (isDragging opacity).
  // handleDragEnd always reads byColumn (real server state) for drop math.
  const renderByColumn = useMemo(() => {
    if (!crossColumnDrag || !activeTask) return byColumn;
    const { targetColumn, insertIndex } = crossColumnDrag;
    const sourceColumn = activeTask.column as Column;

    const result = new Map(byColumn);
    result.set(sourceColumn, (byColumn.get(sourceColumn) ?? []).filter((t) => t.id !== activeTask.id));
    const targetTasks = (byColumn.get(targetColumn) ?? []).filter((t) => t.id !== activeTask.id);
    const withInserted = [...targetTasks];
    withInserted.splice(insertIndex, 0, activeTask);
    result.set(targetColumn, withInserted);
    return result;
  }, [byColumn, crossColumnDrag, activeTask]);

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
      <FilterBar allTags={allTags} />
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 sm:flex-row sm:overflow-x-auto sm:overflow-y-hidden sm:p-5">
          {BOARD_COLUMNS.map((c) => (
            <ColumnView
              key={c}
              column={c}
              tasks={renderByColumn.get(c) ?? []}
              blockedIds={blockedIds}
              projectById={projectById}
              usersById={usersById}
              showProject={!selectedProject}
              onOpenTask={setOpenTaskId}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <TaskCardOverlay
              task={activeTask}
              isBlocked={blockedIds.has(activeTask.id)}
              project={activeTask.project_id ? projectById.get(activeTask.project_id) : undefined}
              showProject={!selectedProject}
              assigneeLabel={formatAssigneeLabel(usersById, activeTask.assigned_to)}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
