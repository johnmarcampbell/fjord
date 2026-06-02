import type { Column, Task } from "@fjord/shared";

/**
 * Resolve a dnd-kit `over.id` to a { column, index } drop target.
 * Returns null if the id doesn't map to a known column or task.
 * Shared by handleDragOver (ghost preview) and handleDragEnd (drop math)
 * so the preview always predicts the real drop position.
 */
export function resolveDropTarget(
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

/**
 * Compute a fractional position for inserting at `index` in an ordered list.
 */
export function computeInsertPosition(list: Task[], index: number): number {
  const before = list[index - 1];
  const after = list[index];
  if (!before && !after) return 0;
  if (!before) return after!.position - 1;
  if (!after) return before.position + 1;
  return (before.position + after.position) / 2;
}
