import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  COLUMNS,
  isTaskBlocked,
  type Column,
  type Task,
} from "@agentic-kanban/shared";
import { api } from "../lib/api.js";
import { useTasks } from "../lib/queries.js";
import { ColumnView } from "./Column.js";
import { TaskDrawer } from "./TaskDrawer.js";

export function Board({ openTaskId, setOpenTaskId }: {
  openTaskId: string | null;
  setOpenTaskId: (id: string | null) => void;
}) {
  const { data: tasks = [], isLoading, isError, error } = useTasks();
  const queryClient = useQueryClient();
  const [_, setDragging] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const byColumn = useMemo(() => {
    const map = new Map<Column, Task[]>();
    for (const c of COLUMNS) map.set(c, []);
    for (const t of tasks) {
      const col = (COLUMNS as readonly string[]).includes(t.column)
        ? (t.column as Column)
        : "Backlog";
      map.get(col)!.push(t);
    }
    for (const c of COLUMNS) {
      map.get(c)!.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [tasks]);

  const blockedIds = useMemo(() => {
    const taskById = new Map(tasks.map((t) => [t.id, t]));
    const ids = new Set<string>();
    for (const t of tasks) {
      if (isTaskBlocked(t, taskById)) ids.add(t.id);
    }
    return ids;
  }, [tasks]);

  const moveMutation = useMutation({
    mutationFn: (args: { id: string; version: number; column: Column; position: number }) =>
      api.updateTask(args.id, {
        version: args.version,
        column: args.column,
        position: args.position,
      }),
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });
      const previous = queryClient.getQueryData<Task[]>(["tasks"]);
      queryClient.setQueryData<Task[]>(["tasks"], (old) =>
        old?.map((t) =>
          t.id === args.id
            ? { ...t, column: args.column, position: args.position }
            : t,
        ) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["tasks"], context.previous);
      }
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  function handleDragEnd(ev: DragEndEvent) {
    setDragging(false);
    const { active, over } = ev;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    const activeTask = tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    let targetColumn: Column;
    let targetIndex: number;
    if (overId.startsWith("col:")) {
      targetColumn = overId.slice(4) as Column;
      targetIndex = byColumn.get(targetColumn)!.length;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (!overTask) return;
      targetColumn = overTask.column as Column;
      const list = byColumn.get(targetColumn)!;
      targetIndex = list.findIndex((t) => t.id === overId);
      if (targetIndex < 0) targetIndex = list.length;
    }

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

  if (isError) {
    return (
      <div className="p-4 text-red-400">
        Failed to load tasks: {(error as Error).message}
      </div>
    );
  }
  if (isLoading) return <div className="p-4 text-slate-400">Loading…</div>;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={() => setDragging(true)}
      onDragCancel={() => setDragging(false)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full gap-3 overflow-x-auto p-4">
        {COLUMNS.map((c) => (
          <ColumnView
            key={c}
            column={c}
            tasks={byColumn.get(c) ?? []}
            blockedIds={blockedIds}
            onOpenTask={setOpenTaskId}
          />
        ))}
      </div>
      {openTaskId && (
        <TaskDrawer
          taskId={openTaskId}
          allTasks={tasks}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </DndContext>
  );
}
