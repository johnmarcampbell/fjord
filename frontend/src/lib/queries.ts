import { useQuery } from "@tanstack/react-query";
import { api } from "./api.js";

export function useSpaces(opts: { includeArchived?: boolean } = {}) {
  const includeArchived = opts.includeArchived ?? false;
  return useQuery({
    queryKey: ["spaces", includeArchived],
    queryFn: () => api.listSpaces({ includeArchived }),
  });
}

export function useTasks(spaceId?: string) {
  return useQuery({
    queryKey: ["tasks", spaceId ?? null],
    queryFn: () => api.listTasks(spaceId),
  });
}

export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: () => api.listUsers() });
}

export function useProjects(spaceId?: string) {
  return useQuery({
    queryKey: ["projects", spaceId ?? null],
    queryFn: () => api.listProjects(spaceId),
  });
}

export function useTaskEvents(taskId: string | null) {
  return useQuery({
    queryKey: ["task-events", taskId],
    queryFn: () => api.listEvents(taskId!),
    enabled: !!taskId,
  });
}

export function useArchivedTasks(spaceId?: string) {
  return useQuery({
    queryKey: ["archived-tasks", spaceId ?? null],
    queryFn: () => api.listArchivedTasks(spaceId),
  });
}

export function useSpaceAccess(spaceId: string | null) {
  return useQuery({
    queryKey: ["space-access", spaceId],
    queryFn: () => api.listSpaceAccess(spaceId!),
    enabled: !!spaceId,
  });
}
