import type { Task } from "@fjord/shared";

/** Sentinel user-id representing "unassigned" in the assignee filter. */
export const UNASSIGNED_SENTINEL = "__unassigned__";

/**
 * Apply the active board filters (project / tags / assignee) to a task list.
 * Shared by Board, BacklogView, and ArchiveView so the filter semantics — in
 * particular the unassigned-sentinel branch — live in one place. Never mutates
 * the input; returns it unchanged when no filters are active.
 */
export function applyTaskFilters(
  tasks: Task[],
  filters: { selectedProject: string | null; selectedTags: string[]; selectedUsers: string[] },
): Task[] {
  const { selectedProject, selectedTags, selectedUsers } = filters;
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
}

/** Distinct tags across the given tasks, sorted. */
export function collectTags(tasks: Task[]): string[] {
  return Array.from(new Set(tasks.flatMap((t) => t.tags))).sort();
}
